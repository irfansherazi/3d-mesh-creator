#!/usr/bin/env python3
"""
Advanced 3D Point Cloud Processing Pipeline
Inspired by XO-Armor geometry processing techniques
Features robust mesh reconstruction, cleaning, and optimization
"""

import sys
import json
import time
import logging
import traceback
import numpy as np
import open3d as o3d
import pymeshlab as ml
import trimesh as tm
from pathlib import Path
from sklearn.cluster import DBSCAN
from skimage import measure

# Most points handed to surface reconstruction per density mode. Ball pivoting time grows much faster than
# linearly: about 6 s at 48k points and 8 min at 258k on a laptop CPU.
RECONSTRUCTION_POINT_BUDGET = {'coarse': 50000, 'medium': 100000, 'dense': 160000}

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stderr)
    ]
)

class AdvancedPointCloudProcessor:
    """Advanced point cloud processor with multiple reconstruction strategies"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
    def load_point_cloud(self, file_path):
        """Load and validate point cloud from various formats"""
        try:
            self.logger.info(f"Loading point cloud from: {file_path}")
            
            if file_path.endswith('.ply'):
                pcd = o3d.io.read_point_cloud(file_path)
                self.logger.info(f"Loaded PLY file: {len(pcd.points)} points")
            elif file_path.endswith('.pcd'):
                pcd = o3d.io.read_point_cloud(file_path)
                self.logger.info(f"Loaded PCD file: {len(pcd.points)} points")
            elif file_path.endswith('.obj'):
                mesh = o3d.io.read_triangle_mesh(file_path)
                pcd = mesh.sample_points_uniformly(number_of_points=10000)
                self.logger.info(f"Loaded OBJ and sampled: {len(pcd.points)} points")
            else:
                raise ValueError(f"Unsupported file format: {file_path}")

            # Validate point cloud
            if len(pcd.points) == 0:
                raise Exception("Point cloud contains no points")

            # Clean invalid coordinates
            points_array = np.asarray(pcd.points)
            if np.any(np.isnan(points_array)) or np.any(np.isinf(points_array)):
                self.logger.warning("Point cloud contains NaN or infinite values, cleaning...")
                valid_mask = ~(np.isnan(points_array).any(axis=1) | np.isinf(points_array).any(axis=1))
                pcd.points = o3d.utility.Vector3dVector(points_array[valid_mask])
                
                # Also clean colors and normals if present
                if pcd.has_colors():
                    colors = np.asarray(pcd.colors)
                    pcd.colors = o3d.utility.Vector3dVector(colors[valid_mask])
                if pcd.has_normals():
                    normals = np.asarray(pcd.normals)
                    pcd.normals = o3d.utility.Vector3dVector(normals[valid_mask])
                    
                self.logger.info(f"After cleaning: {len(pcd.points)} points")

            return pcd
            
        except Exception as e:
            self.logger.error(f"Failed to load point cloud: {str(e)}")
            raise Exception(f"Failed to load point cloud: {str(e)}")

    def analyze_point_cloud(self, pcd):
        """Analyze point cloud characteristics for parameter tuning"""
        points = np.asarray(pcd.points)
        
        # Basic statistics
        bbox = pcd.get_axis_aligned_bounding_box()
        extent = bbox.get_extent()
        diagonal = np.linalg.norm(extent)
        
        # Estimate point spacing with KD-tree queries. A dense distance matrix (cdist) needs
        # 8 bytes x 1000 x N, which is ~20 GB for a 2.5M point scan.
        tree = o3d.geometry.KDTreeFlann(pcd)
        if len(points) > 1000:
            # Average distance to the 10th nearest neighbor over 1000 sampled points
            sample = np.random.choice(len(points), 1000, replace=False)
            rank = 10
        else:
            # Small clouds: average distance to the nearest neighbor over every point
            sample = np.arange(len(points))
            rank = 1
        spacings = []
        for i in sample:
            # k includes the query point itself at distance 0
            k, _, dist2 = tree.search_knn_vector_3d(points[i], rank + 1)
            if k > 1:
                spacings.append(np.sqrt(dist2[min(rank, k - 1)]))
        avg_spacing = float(np.mean(spacings)) if spacings else 0.0
        
        analysis = {
            'num_points': len(points),
            'bounding_box': extent,
            'diagonal': diagonal,
            'avg_point_spacing': avg_spacing,
            'density': len(points) / (extent[0] * extent[1] * extent[2]) if np.prod(extent) > 0 else 0
        }
        
        self.logger.info(f"Point cloud analysis: {analysis}")
        return analysis

    def adaptive_downsample(self, pcd, target_density='medium', analysis=None):
        """Intelligent downsampling based on point cloud characteristics"""
        if analysis is None:
            analysis = self.analyze_point_cloud(pcd)
        
        # Adaptive voxel size based on point spacing and target density
        base_voxel_size = analysis['avg_point_spacing'] * 2.0
        
        density_multipliers = {
            'dense': 0.5,
            'medium': 1.0, 
            'coarse': 2.0
        }
        
        voxel_size = base_voxel_size * density_multipliers.get(target_density, 1.0)
        
        self.logger.info(f"Using adaptive voxel size: {voxel_size:.6f}")

        # Voxel size follows the scan's own spacing, so it works in any unit and honours the density mode.
        # (The previous MeshLab Poisson-disk path used an absolute radius and failed on current pymeshlab.)
        return pcd.voxel_down_sample(voxel_size)

    def limit_points(self, pcd, budget, avg_spacing):
        """Thin the cloud to roughly `budget` points; ball pivoting slows down sharply on large clouds"""
        n = len(pcd.points)
        if n <= budget:
            return pcd
        # avg_spacing is the 10th-neighbour distance, about 1.8x the nearest-neighbour spacing on a surface.
        # Scans are surfaces, so point count falls with the square of the voxel size.
        voxel_size = (avg_spacing / 1.8) * np.sqrt(n / budget)
        for _ in range(8):
            thinned = pcd.voxel_down_sample(voxel_size)
            if len(thinned.points) <= budget:
                break
            voxel_size *= max(1.05, np.sqrt(len(thinned.points) / budget))
        self.logger.info(f"Thinned {n} points to {len(thinned.points)} for reconstruction (budget {budget})")
        return thinned

    def advanced_noise_filtering(self, pcd):
        """Multi-stage noise filtering inspired by XO-Armor processing"""
        original_count = len(pcd.points)
        self.logger.info(f"Starting advanced noise filtering with {original_count} points")
        
        # Stage 1: Statistical outlier removal
        pcd_clean, outlier_indices = pcd.remove_statistical_outlier(
            nb_neighbors=20, std_ratio=2.0
        )
        self.logger.info(f"After statistical filtering: {len(pcd_clean.points)} points")
        
        # Stage 2: Radius outlier removal
        if len(pcd_clean.points) > 100:
            analysis = self.analyze_point_cloud(pcd_clean)
            radius = analysis['avg_point_spacing'] * 3.0
            pcd_clean, _ = pcd_clean.remove_radius_outlier(
                nb_points=8, radius=radius
            )
            self.logger.info(f"After radius filtering: {len(pcd_clean.points)} points")
        
        # Stage 3: Clustering-based filtering for very noisy data
        if len(pcd_clean.points) > 1000 and len(pcd_clean.points) / original_count < 0.5:
            pcd_clean = self._cluster_based_filtering(pcd_clean)
            self.logger.info(f"After cluster filtering: {len(pcd_clean.points)} points")
        
        # Safety check: don't remove more than 80% of points
        if len(pcd_clean.points) < original_count * 0.2:
            self.logger.warning("Filtering removed too many points, using less aggressive filtering")
            pcd_clean, _ = pcd.remove_statistical_outlier(nb_neighbors=10, std_ratio=3.0)
        
        return pcd_clean

    def _cluster_based_filtering(self, pcd):
        """Use DBSCAN clustering to remove small isolated clusters"""
        try:
            points = np.asarray(pcd.points)
            analysis = self.analyze_point_cloud(pcd)
            eps = analysis['avg_point_spacing'] * 3.0
            
            # DBSCAN clustering
            clustering = DBSCAN(eps=eps, min_samples=10).fit(points)
            labels = clustering.labels_
            
            # Find the largest cluster
            unique_labels, counts = np.unique(labels[labels >= 0], return_counts=True)
            if len(unique_labels) > 0:
                largest_cluster = unique_labels[np.argmax(counts)]
                cluster_mask = labels == largest_cluster
                
                # Keep largest cluster and any other significant clusters
                final_mask = labels == largest_cluster
                for label, count in zip(unique_labels, counts):
                    if count > len(points) * 0.05:  # Keep clusters with >5% of points
                        final_mask |= (labels == label)
                
                pcd.points = o3d.utility.Vector3dVector(points[final_mask])
                if pcd.has_colors():
                    colors = np.asarray(pcd.colors)
                    pcd.colors = o3d.utility.Vector3dVector(colors[final_mask])
                if pcd.has_normals():
                    normals = np.asarray(pcd.normals)
                    pcd.normals = o3d.utility.Vector3dVector(normals[final_mask])
                    
            return pcd
            
        except Exception as e:
            self.logger.warning(f"Cluster filtering failed: {e}")
            return pcd

    def robust_normal_estimation(self, pcd):
        """Robust normal estimation with multiple fallback strategies"""
        analysis = self.analyze_point_cloud(pcd)
        
        # Try different normal estimation strategies
        strategies = [
            # Strategy 1: Hybrid search
            lambda: pcd.estimate_normals(
                search_param=o3d.geometry.KDTreeSearchParamHybrid(
                    radius=analysis['avg_point_spacing'] * 5.0, max_nn=30
                )
            ),
            # Strategy 2: KNN search
            lambda: pcd.estimate_normals(
                search_param=o3d.geometry.KDTreeSearchParamKNN(knn=20)
            ),
            # Strategy 3: Radius search only
            lambda: pcd.estimate_normals(
                search_param=o3d.geometry.KDTreeSearchParamRadius(
                    radius=analysis['avg_point_spacing'] * 3.0
                )
            )
        ]
        
        for i, strategy in enumerate(strategies):
            try:
                strategy()
                if pcd.has_normals() and len(pcd.normals) > 0:
                    self.logger.info(f"Normal estimation successful with strategy {i+1}")
                    break
            except Exception as e:
                self.logger.warning(f"Normal estimation strategy {i+1} failed: {e}")
                continue
        else:
            raise Exception("All normal estimation strategies failed")
        
        # Orient normals consistently
        try:
            pcd.orient_normals_consistent_tangent_plane(100)
            self.logger.info("Normals oriented consistently")
        except Exception as e:
            self.logger.warning(f"Could not orient normals consistently: {e}")
        
        return pcd

    def advanced_surface_reconstruction(self, pcd, method="auto", analysis=None):
        """Advanced surface reconstruction with multiple algorithms"""
        if analysis is None:
            analysis = self.analyze_point_cloud(pcd)
        
        self.logger.info(f"Starting surface reconstruction with {len(pcd.points)} points using method: {method}")
        
        # Auto-select method based on point cloud characteristics
        if method == "auto":
            if analysis['num_points'] < 1000:
                method = "alpha_shape"
            elif analysis['density'] > 100000:  # High density
                method = "poisson_ml"  # Use MeshLab Poisson
            else:
                method = "ball_pivoting_ml"  # Use MeshLab Ball Pivoting
        
        # Ensure normals are estimated
        if not pcd.has_normals():
            pcd = self.robust_normal_estimation(pcd)
        
        reconstruction_methods = {
            "poisson": self._poisson_reconstruction_o3d,
            "poisson_ml": self._poisson_reconstruction_ml,
            "ball_pivoting": self._ball_pivoting_reconstruction_o3d,
            "ball_pivoting_ml": self._ball_pivoting_reconstruction_ml,
            "alpha_shape": self._alpha_shape_reconstruction
        }
        
        if method in reconstruction_methods:
            try:
                mesh = reconstruction_methods[method](pcd, analysis)
                self.logger.info(f"Reconstruction successful: {len(mesh.vertices)} vertices, {len(mesh.triangles)} faces")
                return mesh
            except Exception as e:
                self.logger.error(f"Primary reconstruction method {method} failed: {e}")
                # Fallback to simpler method
                self.logger.info("Attempting fallback reconstruction...")
                return self._fallback_reconstruction(pcd, analysis)
        else:
            raise ValueError(f"Unknown reconstruction method: {method}")

    def _poisson_reconstruction_ml(self, pcd, analysis):
        """MeshLab Poisson reconstruction - most robust"""
        try:
            # Convert to MeshLab
            ml_mesh = self._o3d_to_ml_pointcloud(pcd)
            ms = ml.MeshSet()
            ms.add_mesh(ml_mesh)
            
            # Apply Poisson reconstruction
            ms.apply_filter('generate_surface_reconstruction_screened_poisson',
                          depth=9, samplespernode=1.5, pointweight=4.0)
            
            # Convert back to Open3D
            mesh = self._ml_to_o3d_mesh(ms.current_mesh())
            mesh.compute_vertex_normals()
            
            return mesh
            
        except Exception as e:
            self.logger.error(f"MeshLab Poisson failed: {e}")
            raise

    def _ball_pivoting_reconstruction_ml(self, pcd, analysis):
        """MeshLab Ball Pivoting reconstruction"""
        try:
            # Convert to MeshLab
            ml_mesh = self._o3d_to_ml_pointcloud(pcd)
            ms = ml.MeshSet()
            ms.add_mesh(ml_mesh)
            
            # Apply Ball Pivoting
            ms.apply_filter('generate_surface_reconstruction_ball_pivoting',
                          ballradius=ml.PercentageValue(0),  # Auto radius
                          clustering=20,
                          creasethr=90,
                          deletefaces=False)
            
            mesh = self._ml_to_o3d_mesh(ms.current_mesh())
            mesh.compute_vertex_normals()
            
            # Fill holes using trimesh
            mesh_tm = self._o3d_to_trimesh(mesh)
            mesh_tm.fill_holes()
            mesh = self._trimesh_to_o3d(mesh_tm)
            mesh.compute_vertex_normals()
            
            return mesh
            
        except Exception as e:
            self.logger.error(f"MeshLab Ball Pivoting failed: {e}")
            raise

    def _poisson_reconstruction_o3d(self, pcd, analysis):
        """Open3D Poisson reconstruction"""
        depth = min(10, max(6, int(np.log2(analysis['num_points'] / 1000)) + 8))
        mesh, _ = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
            pcd, depth=depth, width=0, scale=1.1, linear_fit=False
        )
        return mesh

    def _ball_pivoting_reconstruction_o3d(self, pcd, analysis):
        """Open3D Ball Pivoting reconstruction"""
        # Adaptive radii based on point spacing
        base_radius = analysis['avg_point_spacing']
        radii = [base_radius * i for i in [1.5, 3.0, 6.0, 12.0]]
        
        mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_ball_pivoting(
            pcd, o3d.utility.DoubleVector(radii)
        )
        return mesh

    def _alpha_shape_reconstruction(self, pcd, analysis):
        """Alpha shape reconstruction for sparse point clouds"""
        alpha = analysis['avg_point_spacing'] * 2.0
        mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_alpha_shape(pcd, alpha)
        return mesh

    def _fallback_reconstruction(self, pcd, analysis):
        """Fallback reconstruction when primary methods fail"""
        try:
            self.logger.info("Using fallback Poisson reconstruction")
            mesh, _ = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
                pcd, depth=6, width=0, scale=1.5
            )
            return mesh
        except:
            self.logger.info("Using fallback alpha shape reconstruction")
            alpha = analysis['avg_point_spacing'] * 3.0
            return o3d.geometry.TriangleMesh.create_from_point_cloud_alpha_shape(pcd, alpha)

    def clean_and_optimize_mesh(self, mesh):
        """Clean and optimize mesh using MeshLab filters"""
        try:
            self.logger.info("Starting mesh cleaning and optimization")
            
            # Convert to MeshLab
            ml_mesh = self._o3d_to_ml_mesh(mesh)
            ms = ml.MeshSet()
            ms.add_mesh(ml_mesh)
            
            # Apply cleaning filters in sequence
            cleaning_filters = [
                ('meshing_remove_duplicate_faces', {}),
                ('meshing_remove_duplicate_vertices', {}),
                ('meshing_merge_close_vertices', {'threshold': ml.PercentageValue(0.001)}),
                ('meshing_remove_null_faces', {}),
                ('meshing_repair_non_manifold_edges', {}),
                ('meshing_remove_unreferenced_vertices', {}),
                ('meshing_remove_connected_component_by_face_number', {'mincomponentsize': 25})
            ]
            
            for filter_name, params in cleaning_filters:
                try:
                    ms.apply_filter(filter_name, **params)
                    self.logger.debug(f"Applied filter: {filter_name}")
                except Exception as e:
                    self.logger.warning(f"Filter {filter_name} failed: {e}")
            
            # Convert back to Open3D
            cleaned_mesh = self._ml_to_o3d_mesh(ms.current_mesh())
            cleaned_mesh.compute_vertex_normals()
            
            self.logger.info(f"Mesh cleaning complete: {len(cleaned_mesh.vertices)} vertices, {len(cleaned_mesh.triangles)} faces")
            return cleaned_mesh
            
        except Exception as e:
            self.logger.error(f"Mesh cleaning failed: {e}")
            mesh.compute_vertex_normals()
            return mesh

    def smooth_mesh(self, mesh, smooth_mode="medium"):
        """Smooth mesh using Taubin algorithm"""
        try:
            smooth_params = {
                'low': {'iterations': 10, 'mu': -0.53, 'lambda': 0.5},
                'medium': {'iterations': 25, 'mu': -0.53, 'lambda': 0.5},
                'high': {'iterations': 50, 'mu': -0.15, 'lambda': 0.65}
            }
            
            params = smooth_params.get(smooth_mode, smooth_params['medium'])
            
            # Use MeshLab for better smoothing
            ml_mesh = self._o3d_to_ml_mesh(mesh)
            ms = ml.MeshSet()
            ms.add_mesh(ml_mesh)
            
            ms.apply_filter('apply_coord_taubin_smoothing',
                          stepsmoothnum=params['iterations'],
                          mu=params['mu'],
                          lambda_=params['lambda'])
            
            smoothed_mesh = self._ml_to_o3d_mesh(ms.current_mesh())
            smoothed_mesh.compute_vertex_normals()
            
            self.logger.info(f"Mesh smoothing complete with {smooth_mode} settings")
            return smoothed_mesh
            
        except Exception as e:
            self.logger.warning(f"MeshLab smoothing failed: {e}, using Open3D")
            return mesh.filter_smooth_taubin(**params)

    # Utility conversion functions
    @staticmethod
    def _rgba(colors):
        """pymeshlab wants vertex colours as float64 RGBA in 0..1; Open3D stores RGB in 0..1"""
        colors = np.asarray(colors, dtype=np.float64)
        return np.hstack([colors, np.ones((len(colors), 1))])

    def _o3d_to_ml_pointcloud(self, pcd):
        """Convert Open3D point cloud to MeshLab mesh, keeping normals and colours"""
        kwargs = {"vertex_matrix": np.asarray(pcd.points).astype(np.float64)}
        if pcd.has_normals():
            kwargs["v_normals_matrix"] = np.asarray(pcd.normals).astype(np.float64)
        if pcd.has_colors():
            kwargs["v_color_matrix"] = self._rgba(pcd.colors)
        return ml.Mesh(**kwargs)

    def _o3d_to_ml_mesh(self, mesh):
        """Convert Open3D mesh to MeshLab mesh, keeping vertex colours"""
        kwargs = {
            "vertex_matrix": np.asarray(mesh.vertices).astype(np.float64),
            "face_matrix": np.asarray(mesh.triangles).astype(np.int32),
        }
        if mesh.has_vertex_colors():
            kwargs["v_color_matrix"] = self._rgba(mesh.vertex_colors)
        return ml.Mesh(**kwargs)

    def _ml_to_o3d_pointcloud(self, ml_mesh):
        """Convert MeshLab mesh to Open3D point cloud"""
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(ml_mesh.vertex_matrix())

        if ml_mesh.has_vertex_normal():
            pcd.normals = o3d.utility.Vector3dVector(ml_mesh.vertex_normal_matrix())

        if ml_mesh.has_vertex_color():
            # Already RGBA floats in 0..1
            pcd.colors = o3d.utility.Vector3dVector(ml_mesh.vertex_color_matrix()[:, :3])

        return pcd

    def _ml_to_o3d_mesh(self, ml_mesh):
        """Convert MeshLab mesh to Open3D mesh, keeping vertex colours"""
        mesh = o3d.geometry.TriangleMesh()
        mesh.vertices = o3d.utility.Vector3dVector(ml_mesh.vertex_matrix())
        mesh.triangles = o3d.utility.Vector3iVector(ml_mesh.face_matrix())
        if ml_mesh.has_vertex_color():
            mesh.vertex_colors = o3d.utility.Vector3dVector(ml_mesh.vertex_color_matrix()[:, :3])
        return mesh

    def _o3d_to_trimesh(self, mesh):
        """Convert Open3D mesh to trimesh"""
        vertices = np.asarray(mesh.vertices)
        faces = np.asarray(mesh.triangles)
        vertex_colors = None
        if mesh.has_vertex_colors():
            vertex_colors = (np.asarray(mesh.vertex_colors) * 255).round().astype(np.uint8)
        return tm.Trimesh(vertices=vertices, faces=faces, vertex_colors=vertex_colors)

    def _trimesh_to_o3d(self, tm_mesh):
        """Convert trimesh to Open3D mesh"""
        mesh = o3d.geometry.TriangleMesh()
        mesh.vertices = o3d.utility.Vector3dVector(tm_mesh.vertices)
        mesh.triangles = o3d.utility.Vector3iVector(tm_mesh.faces)
        colors = getattr(tm_mesh.visual, "vertex_colors", None)
        if colors is not None and len(colors) == len(tm_mesh.vertices):
            mesh.vertex_colors = o3d.utility.Vector3dVector(np.asarray(colors)[:, :3] / 255.0)
        return mesh

def process_point_cloud(input_path, output_path, voxel_size, method, enable_filtering, enable_reconstruction, density_mode="medium", smoothing_mode="medium"):
    """Main processing pipeline using advanced processor"""
    start_time = time.time()
    processor = AdvancedPointCloudProcessor()
    
    try:
        # Load point cloud
        pcd = processor.load_point_cloud(input_path)
        original_points = len(pcd.points)
        
        # Analyze point cloud characteristics
        analysis = processor.analyze_point_cloud(pcd)
        
        # Apply intelligent downsampling
        if voxel_size > 0:
            pcd = processor.adaptive_downsample(pcd, density_mode, analysis)
            processor.logger.info(f"After downsampling: {len(pcd.points)} points")
        
        # Apply advanced noise filtering
        if enable_filtering:
            pcd = processor.advanced_noise_filtering(pcd)
            processor.logger.info(f"After filtering: {len(pcd.points)} points")
        
        processed_points = len(pcd.points)
        
        # Check if we have enough points
        if processed_points < 3:
            raise Exception(f"Too few points after processing: {processed_points}")
        
        # Apply advanced surface reconstruction
        if enable_reconstruction:
            # Update analysis after processing
            analysis = processor.analyze_point_cloud(pcd)

            # Keep reconstruction time bounded on very large scans
            budget = RECONSTRUCTION_POINT_BUDGET.get(density_mode, RECONSTRUCTION_POINT_BUDGET['medium'])
            if len(pcd.points) > budget:
                pcd = processor.limit_points(pcd, budget, analysis['avg_point_spacing'])
                processed_points = len(pcd.points)
                analysis = processor.analyze_point_cloud(pcd)

            mesh = processor.advanced_surface_reconstruction(pcd, method, analysis)
            
            # Clean and optimize mesh
            mesh = processor.clean_and_optimize_mesh(mesh)
            
            # Apply smoothing based on mode
            if len(mesh.vertices) > 1000:
                mesh = processor.smooth_mesh(mesh, smooth_mode=smoothing_mode)
            
            # Ensure mesh is properly oriented and colored
            if not mesh.has_vertex_normals():
                mesh.compute_vertex_normals()
            
            # Set a default color if none exists
            if not mesh.has_vertex_colors():
                mesh.paint_uniform_color([0.7, 0.7, 0.7])
            
            # Save mesh
            success = o3d.io.write_triangle_mesh(output_path, mesh, 
                                               write_ascii=False, 
                                               write_vertex_normals=True,
                                               write_vertex_colors=True)
            
            if not success:
                raise Exception("Failed to write output mesh")
            
            stats = {
                "original_points": original_points,
                "processed_points": processed_points,
                "faces": len(mesh.triangles),
                "vertices": len(mesh.vertices),
                "processing_time": time.time() - start_time,
                "method": method,
                "density_mode": density_mode,
                "smoothing_mode": smoothing_mode,
                "voxel_size": voxel_size,
                "filtering_enabled": enable_filtering,
                "reconstruction_enabled": enable_reconstruction,
                "is_watertight": mesh.is_watertight(),
                "bounding_box_volume": mesh.get_axis_aligned_bounding_box().volume()
            }
        else:
            # Point clouds can't be stored as GLB; the caller passes a .ply/.pcd output path for this mode
            if not output_path.lower().endswith(('.ply', '.pcd')):
                raise Exception("Point cloud output needs a .ply or .pcd output path")
            if not o3d.io.write_point_cloud(output_path, pcd):
                raise Exception("Failed to write output point cloud")

            stats = {
                "original_points": original_points,
                "processed_points": processed_points,
                "faces": 0,
                "vertices": processed_points,
                "processing_time": time.time() - start_time,
                "method": method,
                "density_mode": density_mode,
                "smoothing_mode": smoothing_mode,
                "voxel_size": voxel_size,
                "filtering_enabled": enable_filtering,
                "reconstruction_enabled": enable_reconstruction,
                "is_watertight": False,
                "bounding_box_volume": 0
            }
        
        return stats
        
    except Exception as e:
        processor.logger.error(f"Processing failed: {str(e)}")
        processor.logger.error(traceback.format_exc())
        raise


def main():
    if len(sys.argv) not in [7, 9]:  # Support both old and new argument formats
        print("Usage: python process_point_cloud.py <input> <output> <voxel_size> <method> <filtering> <reconstruction> [density_mode] [smoothing_mode]")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    voxel_size = float(sys.argv[3])
    method = sys.argv[4]
    enable_filtering = sys.argv[5].lower() == 'true'
    enable_reconstruction = sys.argv[6].lower() == 'true'
    
    # New optional parameters
    density_mode = sys.argv[7] if len(sys.argv) > 7 else 'medium'
    smoothing_mode = sys.argv[8] if len(sys.argv) > 8 else 'medium'
    
    try:
        stats = process_point_cloud(
            input_path, 
            output_path, 
            voxel_size, 
            method, 
            enable_filtering, 
            enable_reconstruction,
            density_mode,
            smoothing_mode
        )
        
        # Output stats as JSON for the API to parse
        print(json.dumps(stats))
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
