#!/usr/bin/env python3
"""
Environment Setup Script for Advanced Point Cloud Processing
This script helps set up the Python virtual environment with all required dependencies.
"""

import sys
import subprocess
import os
import platform
from pathlib import Path

def run_command(command, description):
    """Run a command and handle errors gracefully"""
    print(f"\n🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ {description} completed successfully")
            if result.stdout:
                print(result.stdout)
            return True
        else:
            print(f"❌ {description} failed")
            print(f"Error: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ {description} failed with exception: {e}")
        return False

def check_python_version():
    """Check if Python version is compatible"""
    print("🔍 Checking Python version...")
    version = sys.version_info
    if version.major == 3 and version.minor >= 8:
        print(f"✅ Python {version.major}.{version.minor}.{version.micro} is compatible")
        return True
    else:
        print(f"❌ Python {version.major}.{version.minor}.{version.micro} is not compatible. Requires Python 3.8+")
        return False

def setup_virtual_environment():
    """Set up virtual environment"""
    scripts_dir = Path(__file__).parent
    venv_dir = scripts_dir / ".venv"
    
    if venv_dir.exists():
        print("🔄 Virtual environment already exists, removing old one...")
        import shutil
        shutil.rmtree(venv_dir)
    
    # Create virtual environment
    if not run_command(f'python -m venv "{venv_dir}"', "Creating virtual environment"):
        return False
    
    # Determine activation script based on OS
    if platform.system() == "Windows":
        activate_script = venv_dir / "Scripts" / "activate.bat"
        pip_executable = venv_dir / "Scripts" / "pip.exe"
        python_executable = venv_dir / "Scripts" / "python.exe"
    else:
        activate_script = venv_dir / "bin" / "activate"
        pip_executable = venv_dir / "bin" / "pip"
        python_executable = venv_dir / "bin" / "python"
    
    # Upgrade pip
    if not run_command(f'"{python_executable}" -m pip install --upgrade pip', "Upgrading pip"):
        return False
    
    # Install requirements
    requirements_file = scripts_dir / "requirements.txt"
    if not run_command(f'"{pip_executable}" install -r "{requirements_file}"', "Installing requirements"):
        return False
    
    print(f"\n✅ Virtual environment set up successfully at: {venv_dir}")
    
    # Print activation instructions
    print("\n📋 To activate the virtual environment:")
    if platform.system() == "Windows":
        print(f"   {activate_script}")
    else:
        print(f"   source {activate_script}")
    
    return True

def test_imports():
    """Test if all required packages can be imported"""
    print("\n🧪 Testing package imports...")
    
    test_packages = [
        ("open3d", "Open3D"),
        ("numpy", "NumPy"),
        ("pymeshlab", "PyMeshLab"),
        ("trimesh", "Trimesh"),
        ("sklearn", "Scikit-learn"),
        ("skimage", "Scikit-image"),
        ("PIL", "Pillow"),
        ("scipy", "SciPy")
    ]
    
    failed_imports = []
    
    for package, name in test_packages:
        try:
            __import__(package)
            print(f"   ✅ {name}")
        except ImportError as e:
            print(f"   ❌ {name}: {e}")
            failed_imports.append(name)
    
    if failed_imports:
        print(f"\n❌ Some packages failed to import: {', '.join(failed_imports)}")
        return False
    else:
        print("\n✅ All packages imported successfully!")
        return True

def main():
    print("🚀 Advanced Point Cloud Processing - Environment Setup")
    print("=" * 60)
    
    # Check Python version
    if not check_python_version():
        print("\n❌ Setup failed: Incompatible Python version")
        print("Please install Python 3.8 or higher")
        sys.exit(1)
    
    # Set up virtual environment
    if not setup_virtual_environment():
        print("\n❌ Setup failed: Could not create virtual environment")
        sys.exit(1)
    
    # Test imports (run in the virtual environment)
    scripts_dir = Path(__file__).parent
    venv_dir = scripts_dir / ".venv"
    
    if platform.system() == "Windows":
        python_executable = venv_dir / "Scripts" / "python.exe"
    else:
        python_executable = venv_dir / "bin" / "python"
    
    test_command = f'"{python_executable}" -c "import sys; sys.path.insert(0, \\"{scripts_dir}\\"); exec(open(\\"{__file__}\\").read().split(\\"if __name__\\")[0] + \\"test_imports()\\"))"'
    
    if not run_command(test_command, "Testing imports in virtual environment"):
        print("\n❌ Setup completed but some packages may not work correctly")
        print("You may need to install additional system dependencies")
    else:
        print("\n🎉 Setup completed successfully!")
        print("\nYour advanced point cloud processing environment is ready to use!")
        print("\n🔧 Key features enabled:")
        print("   • MeshLab integration for robust reconstruction")
        print("   • Advanced noise filtering with clustering")
        print("   • Multiple reconstruction algorithms")
        print("   • Automatic parameter tuning")
        print("   • Mesh optimization and smoothing")

if __name__ == "__main__":
    main()