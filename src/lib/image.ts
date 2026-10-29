import type { ImagePayload } from './types'

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // raw file limit before resizing
export const MAX_SEND_BYTES = 4 * 1024 * 1024 // what the server accepts
const MAX_DIM = 1400

/** Returns an error message for an unacceptable file, or null. */
export function validateFile(file: File): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return 'Please upload a PNG, JPG, or WebP screenshot.'
  if (file.size > MAX_UPLOAD_BYTES) return 'That image is over 10 MB. Please use a smaller screenshot.'
  return null
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image. It may be corrupted.'))
    img.src = src
  })
}

/** Draws an image (file or same-origin URL, including SVG) to a canvas, downsizes it, and returns base64 JPEG. */
export async function toPayload(source: File | string): Promise<{ payload: ImagePayload; previewUrl: string }> {
  const src = typeof source === 'string' ? source : URL.createObjectURL(source)
  try {
    const img = await loadImage(src)
    const w0 = img.naturalWidth || 1200
    const h0 = img.naturalHeight || 900
    const scale = Math.min(1, MAX_DIM / Math.max(w0, h0))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w0 * scale)
    canvas.height = Math.round(h0 * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser could not process the image.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    let quality = 0.88
    let dataUrl = canvas.toDataURL('image/jpeg', quality)
    while (dataUrl.length * 0.75 > MAX_SEND_BYTES && quality > 0.4) {
      quality -= 0.15
      dataUrl = canvas.toDataURL('image/jpeg', quality)
    }
    if (dataUrl.length * 0.75 > MAX_SEND_BYTES) throw new Error('Image is still over 4 MB after resizing.')
    return { payload: { mediaType: 'image/jpeg', data: dataUrl.split(',')[1] }, previewUrl: dataUrl }
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(src)
  }
}
