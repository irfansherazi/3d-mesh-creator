import path from "path"

// Locations are configurable so the same code runs locally (scripts/.venv) and in Docker (/opt/venv).
export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads")
export const SCRIPTS_DIR = process.env.SCRIPTS_DIR || path.join(process.cwd(), "scripts")

export const PYTHON_BIN =
  process.env.PYTHON_BIN ||
  (process.platform === "win32"
    ? path.join(SCRIPTS_DIR, ".venv", "Scripts", "python.exe")
    : path.join(SCRIPTS_DIR, ".venv", "bin", "python3"))

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024

// Resolves a client-supplied file name inside UPLOADS_DIR, rejecting anything that could escape it.
export function uploadPath(filename: string): string | null {
  if (!filename || filename !== path.basename(filename) || filename.startsWith(".")) {
    return null
  }
  return path.join(UPLOADS_DIR, filename)
}
