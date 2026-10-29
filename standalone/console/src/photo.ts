// Turns whatever the phone camera or gallery hands over into the small square JPEG the
// server stores, so uploads stay fast on venue Wi-Fi and the server never decodes images.
import { AVATAR_PHOTO_SIZE } from '@pipod/shared'

/** Center-crop to a square and scale to `AVATAR_PHOTO_SIZE`; EXIF rotation is applied. */
export async function toAvatarJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_PHOTO_SIZE
    canvas.height = AVATAR_PHOTO_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Bild konnte nicht verarbeitet werden.')
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_PHOTO_SIZE,
      AVATAR_PHOTO_SIZE,
    )
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('Bild konnte nicht verarbeitet werden.')),
        'image/jpeg',
        0.85,
      ),
    )
  } finally {
    bitmap.close()
  }
}
