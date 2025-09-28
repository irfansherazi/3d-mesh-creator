import { type NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

export async function GET(request: NextRequest, { params }: { params: { filename: string } }) {
  try {
    const filename = params.filename
    const filepath = path.join(process.cwd(), "uploads", filename)

    if (!existsSync(filepath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const fileBuffer = await readFile(filepath)
    const fileExtension = path.extname(filename).toLowerCase()

    // Set appropriate content type
    let contentType = "application/octet-stream"
    if (fileExtension === ".glb") {
      contentType = "model/gltf-binary"
    } else if (fileExtension === ".obj") {
      contentType = "text/plain"
    } else if (fileExtension === ".ply") {
      contentType = "application/octet-stream"
    }

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error("Download error:", error)
    return NextResponse.json(
      {
        error: "Failed to download file",
      },
      { status: 500 },
    )
  }
}
