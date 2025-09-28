import { type NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
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
    const uploadsDir = path.join(process.cwd(), "uploads")
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const filename = `${timestamp}_${file.name}`
    const filepath = path.join(uploadsDir, filename)

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
