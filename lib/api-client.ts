export interface UploadResponse {
  success: boolean
  filename?: string
  originalName?: string
  size?: number
  type?: string
  uploadPath?: string
  error?: string
}

export type DensityMode = "dense" | "medium" | "coarse"
export type SmoothingMode = "low" | "medium" | "high"

export interface ProcessingParams {
  filename: string
  // The processor only checks voxelSize > 0 to enable downsampling; the actual size adapts to the scan
  voxelSize: number
  method: string
  enableFiltering: boolean
  enableReconstruction: boolean
  densityMode: DensityMode
  smoothingMode: SmoothingMode
}

export interface ProcessingStats {
  original_points?: number
  processed_points?: number
  faces?: number
  vertices?: number
  processing_time?: number
  method?: string
  density_mode?: string
  smoothing_mode?: string
  is_watertight?: boolean
  bounding_box_volume?: number
}

export interface ProcessingResponse {
  success: boolean
  processedFile?: string
  stats?: ProcessingStats
  processingTime?: number
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

  static async processFile(params: ProcessingParams, signal?: AbortSignal): Promise<ProcessingResponse> {
    const response = await fetch("/api/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
      signal,
    })

    return response.json()
  }

  static getDownloadUrl(filename: string): string {
    return `/api/download/${encodeURIComponent(filename)}`
  }
}
