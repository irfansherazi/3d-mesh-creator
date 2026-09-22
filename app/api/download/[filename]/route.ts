import { type NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { uploadPath } from "@/lib/paths"

export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await params
    const filepath = uploadPath(filename)

    if (!filepath || !existsSync(filepath)) {
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

    return new NextResponse(new Uint8Array(fileBuffer), {
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
