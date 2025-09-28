export interface UploadResponse {
  success: boolean
  filename?: string
  originalName?: string
  size?: number
  type?: string
  uploadPath?: string
  error?: string
}

export interface ProcessingParams {
  filename: string
  voxelSize: number
  method: string
  enableFiltering: boolean
  enableReconstruction: boolean
}

export interface ProcessingResponse {
  success: boolean
  processedFile?: string
  stats?: {
    original_points: number
    processed_points: number
    faces: number
    vertices: number
    processing_time: number
    method: string
    voxel_size: number
    filtering_enabled: boolean
    reconstruction_enabled: boolean
  }
  error?: string
}

export class ApiClient {
  static async uploadFile(file: File): Promise<UploadResponse> {
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    })

    return response.json()
  }

  static async processFile(params: ProcessingParams): Promise<ProcessingResponse> {
    const response = await fetch("/api/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    })

    return response.json()
  }

  static getDownloadUrl(filename: string): string {
    return `/api/download/${filename}`
  }
}
