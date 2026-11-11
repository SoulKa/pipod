// Turns whatever the phone camera or gallery hands over into the small square JPEG the
// server stores, so uploads stay fast on venue Wi-Fi and the server never decodes images.
import { AVATAR_PHOTO_SIZE } from '@pipod/shared'

export interface PhotoSize {
  width: number
  height: number
}

/**
 * Which square of the photo becomes the avatar: its center in source pixels, and how far
 * it is zoomed in (1 = the square spans the photo's shorter side).
 */
export interface PhotoCrop {
  cx: number
  cy: number
  zoom: number
}

/** Beyond this a 512px avatar is mostly upscaled blur, even from a phone camera. */
export const MAX_PHOTO_ZOOM = 4

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Edge length of the crop square in source pixels. */
export function cropSide(size: PhotoSize, zoom: number): number {
  return Math.min(size.width, size.height) / zoom
}

export function centeredCrop(size: PhotoSize): PhotoCrop {
  return { cx: size.width / 2, cy: size.height / 2, zoom: 1 }
}

/** Keep the zoom in range and the square inside the photo, so the avatar never shows blank. */
export function clampCrop(crop: PhotoCrop, size: PhotoSize): PhotoCrop {
  const zoom = clamp(crop.zoom, 1, MAX_PHOTO_ZOOM)
  const half = cropSide(size, zoom) / 2
  return {
    cx: clamp(crop.cx, half, size.width - half),
    cy: clamp(crop.cy, half, size.height - half),
    zoom,
  }
}

/**
 * Apply a drag of (dx, dy) on a preview `viewport` px wide. The photo follows the finger,
 * so the crop square moves the other way.
 */
export function panCrop(
  crop: PhotoCrop,
  size: PhotoSize,
  dx: number,
  dy: number,
  viewport: number,
): PhotoCrop {
  const scale = cropSide(size, crop.zoom) / viewport
  return clampCrop({ ...crop, cx: crop.cx - dx * scale, cy: crop.cy - dy * scale }, size)
}

/** Zoom around the current center (clamping may then nudge it back inside the photo). */
export function zoomCrop(crop: PhotoCrop, size: PhotoSize, zoom: number): PhotoCrop {
  return clampCrop({ ...crop, zoom }, size)
}

/** Decode a picked file with its EXIF rotation applied. */
export async function loadPhoto(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Dieses Bild kann der Browser nicht öffnen.')
  }
}

/** Draw the cropped square of `photo` over the whole `side` × `side` canvas. */
export function drawCrop(
  ctx: CanvasRenderingContext2D,
  photo: ImageBitmap,
  crop: PhotoCrop,
  side: number,
): void {
  const source = cropSide(photo, crop.zoom)
  ctx.drawImage(photo, crop.cx - source / 2, crop.cy - source / 2, source, source, 0, 0, side, side)
}

/** Render the chosen square at `AVATAR_PHOTO_SIZE` as JPEG. */
export async function toAvatarJpeg(photo: ImageBitmap, crop: PhotoCrop): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_PHOTO_SIZE
  canvas.height = AVATAR_PHOTO_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Bild konnte nicht verarbeitet werden.')
  drawCrop(ctx, photo, clampCrop(crop, photo), AVATAR_PHOTO_SIZE)
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht verarbeitet werden.'))),
      'image/jpeg',
      0.85,
    ),
  )
}
