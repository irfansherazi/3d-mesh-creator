import { type NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import path from "path"
import { existsSync } from "fs"
import { PYTHON_BIN, SCRIPTS_DIR, UPLOADS_DIR, uploadPath } from "@/lib/paths"

interface ProcessingParams {
  filename: string
  voxelSize: number
  method: string
  enableFiltering: boolean
  enableReconstruction: boolean
  densityMode: string
  smoothingMode: string
}

export async function POST(request: NextRequest) {
  console.log("=== PROCESSING API ROUTE START ===")
  try {
    console.log("Parsing request body...")
    const params: ProcessingParams = await request.json()
    console.log("Received params:", params)

    const inputPath = uploadPath(params.filename)
    console.log("Input path:", inputPath)

    if (!inputPath || !existsSync(inputPath)) {
      console.log("File not found:", inputPath)
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    console.log("File exists, proceeding with processing...")

    // Generate output filename
    const timestamp = Date.now()
    // Without reconstruction the result is a cleaned point cloud, which GLB can't hold
    const outputFilename = `processed_${timestamp}.${params.enableReconstruction ? "glb" : "ply"}`
    const outputPath = path.join(UPLOADS_DIR, outputFilename)
    console.log("Output path:", outputPath)

    console.log("Starting Python processor...")
    // Run Python processing script
    const result = await runPythonProcessor(inputPath, outputPath, params)
    console.log("Python processor result:", result)

    if (result.success) {
      console.log("Processing successful, returning response")
      return NextResponse.json({
        success: true,
        processedFile: outputFilename,
        stats: result.stats,
        processingTime: result.processingTime,
      })
    } else {
      console.log("Processing failed:", result.error)
      return NextResponse.json(
        {
          error: result.error || "Processing failed",
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("=== PROCESSING API ERROR ===")
    console.error("Error details:", error)
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      {
        error: "Failed to process file: " + (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 },
    )
  }
}

function runPythonProcessor(
  inputPath: string,
  outputPath: string,
  params: ProcessingParams,
): Promise<{ success: boolean; stats?: any; processingTime?: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    console.log("=== PYTHON PROCESSOR START ===")

    // Python script arguments - updated for new advanced processor
    const args = [
      path.join(SCRIPTS_DIR, "process_point_cloud.py"),
      inputPath,
      outputPath,
      params.voxelSize.toString(),
      params.method,
      params.enableFiltering.toString(),
      params.enableReconstruction.toString(),
      params.densityMode || 'medium',
      params.smoothingMode || 'medium',
    ]

    // scripts/.venv locally; PYTHON_BIN points at /opt/venv in the Docker image
    const pythonExecutable = PYTHON_BIN

    console.log("Python executable:", pythonExecutable)
    console.log("Python args:", args)
    console.log("Spawning Python process...")

    const pythonProcess = spawn(pythonExecutable, args)

    let stdout = ""
    let stderr = ""

    pythonProcess.stdout.on("data", (data) => {
      const chunk = data.toString()
      console.log("Python stdout chunk:", chunk)
      stdout += chunk
    })

    pythonProcess.stderr.on("data", (data) => {
      const chunk = data.toString()
      console.log("Python stderr chunk:", chunk)
      stderr += chunk
    })

    pythonProcess.on("error", (error) => {
      console.error("Python process error:", error)
      resolve({
        success: false,
        error: `Failed to start Python process: ${error.message}`,
      })
    })

    pythonProcess.on("close", (code) => {
      const processingTime = Date.now() - startTime
      console.log("=== PYTHON PROCESS COMPLETED ===")
      console.log("Exit code:", code)
      console.log("Processing time:", processingTime + "ms")
      console.log("Final stdout:", stdout)
      console.log("Final stderr:", stderr)

      if (code === 0) {
        try {
          // Find the JSON in stdout - look for the last line that contains JSON
          const lines = stdout.trim().split('\n')
          let jsonResult = {}

          console.log("Looking for JSON in output lines:", lines.length)

          // Look for JSON in the output (should be the last line)
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim()
            console.log(`Checking line ${i}:`, line)
            if (line.startsWith('{') && line.endsWith('}')) {
              console.log("Found JSON line:", line)
              jsonResult = JSON.parse(line)
              break
            }
          }

          console.log("Parsed JSON result:", jsonResult)

          resolve({
            success: true,
            stats: jsonResult,
            processingTime,
          })
        } catch (parseError) {
          console.error("Failed to parse Python output:", parseError)
          console.log("Raw stdout for parsing:", stdout)
          resolve({
            success: true,
            stats: {},
            processingTime,
          })
        }
      } else {
        console.error("Python process failed with code:", code)
        resolve({
          success: false,
          error: stderr || stdout || `Process exited with code ${code}`,
        })
      }
    })
  })
}
