import { NextResponse } from "next/server"
import { existsSync } from "fs"
import { PYTHON_BIN } from "@/lib/paths"

// Used by the Docker healthcheck; reports whether the Python processor is available.
export const dynamic = "force-dynamic"

export async function GET() {
  const pythonAvailable = existsSync(PYTHON_BIN)
  return NextResponse.json(
    { status: pythonAvailable ? "ok" : "degraded", pythonAvailable },
    { status: pythonAvailable ? 200 : 503 },
  )
}
