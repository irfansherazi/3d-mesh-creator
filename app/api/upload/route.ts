import { type NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { MAX_UPLOAD_BYTES, UPLOADS_DIR } from "@/lib/paths"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
        { status: 413 },
      )
    }

    // Validate file type
    const allowedExtensions = [".ply", ".pcd", ".obj"]
    const fileExtension = path.extname(file.name).toLowerCase()

    if (!allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        {
          error: "Invalid file type. Please upload .ply, .pcd, or .obj files.",
        },
        { status: 400 },
      )
    }

    // Create uploads directory if it doesn't exist
    if (!existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR, { recursive: true })
    }

    // Generate unique filename; keep only the base name with safe characters so it can't escape UPLOADS_DIR
    const timestamp = Date.now()
    const safeName = path.basename(file.name).replace(/[^A-Za-z0-9._-]/g, "_")
    const filename = `${timestamp}_${safeName}`
    const filepath = path.join(UPLOADS_DIR, filename)

    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filepath, buffer)

    // Return file info
    return NextResponse.json({
      success: true,
      filename,
      originalName: file.name,
      size: file.size,
      type: fileExtension,
      uploadPath: filepath,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      {
        error: "Failed to upload file",
      },
      { status: 500 },
    )
  }
}
