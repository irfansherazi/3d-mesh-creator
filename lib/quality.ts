import type { DensityMode, SmoothingMode } from "@/lib/api-client"

export type Quality = "quick" | "balanced" | "detailed"

export interface QualityPreset {
  label: string
  description: string
  densityMode: DensityMode
  smoothingMode: SmoothingMode
  /** Rough wall-clock estimate in seconds for a typical product scan, used for the progress display */
  seconds: number
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  quick: {
    label: "Quick",
    description: "Smallest file, softer edges",
    densityMode: "coarse",
    smoothingMode: "medium",
    seconds: 10,
  },
  balanced: {
    label: "Balanced",
    description: "Crisp enough for product pages",
    densityMode: "medium",
    smoothingMode: "medium",
    seconds: 30,
  },
  detailed: {
    label: "Detailed",
    description: "Sharpest edges, largest file",
    densityMode: "dense",
    smoothingMode: "low",
    seconds: 60,
  },
}

export const SURFACE_METHODS = [
  { id: "auto", label: "Auto (recommended)" },
  { id: "poisson_ml", label: "MeshLab Poisson" },
  { id: "ball_pivoting_ml", label: "MeshLab ball pivoting" },
  { id: "poisson", label: "Open3D Poisson" },
  { id: "alpha_shape", label: "Alpha shape" },
  { id: "ball_pivoting", label: "Open3D ball pivoting" },
] as const

export interface AdvancedOptions {
  method: string
  /** null follows the quality preset */
  smoothingMode: SmoothingMode | null
  enableFiltering: boolean
  enableReconstruction: boolean
}

export const DEFAULT_ADVANCED: AdvancedOptions = {
  method: "auto",
  smoothingMode: null,
  enableFiltering: true,
  enableReconstruction: true,
}

/** Processing stages in the order the Python pipeline runs them, with the share of the run each takes. */
export const STAGES = [
  { id: "load", label: "Reading the scan", until: 0.15 },
  { id: "filter", label: "Removing noise", until: 0.4 },
  { id: "reconstruct", label: "Building the surface", until: 0.8 },
  { id: "optimize", label: "Cleaning and smoothing", until: 1 },
] as const

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`
}

export function formatCount(n: number) {
  return n.toLocaleString("en-US")
}

/** "1758914136947_Car_wheel_cap.ply" becomes "Car wheel cap" */
export function friendlyName(filename: string) {
  const base = filename.replace(/^\d+_/, "").replace(/\.[^.]+$/, "")
  const words = base.replace(/[_-]+/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Untitled scan"
}
