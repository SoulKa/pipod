import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_ZOOM, centeredCrop, clampCrop, cropSide, panCrop, zoomCrop } from './photo'

const landscape = { width: 400, height: 300 }

describe('photo crop', () => {
  it('starts centered on the full shorter side', () => {
    const crop = centeredCrop(landscape)
    expect(crop).toEqual({ cx: 200, cy: 150, zoom: 1 })
    expect(cropSide(landscape, crop.zoom)).toBe(300)
  })

  it('pans along the longer side only while zoomed out', () => {
    // A 300px square in a 300px-wide preview: 1 preview px = 1 photo px.
    const moved = panCrop(centeredCrop(landscape), landscape, 30, 30, 300)
    expect(moved).toEqual({ cx: 170, cy: 150, zoom: 1 })
  })

  it('stops at the photo edge', () => {
    const moved = panCrop(centeredCrop(landscape), landscape, 1000, -1000, 300)
    expect(moved).toEqual({ cx: 150, cy: 150, zoom: 1 })
  })

  it('pans less of the photo per preview px when zoomed in', () => {
    const zoomed = zoomCrop(centeredCrop(landscape), landscape, 2)
    expect(panCrop(zoomed, landscape, 30, -30, 300)).toEqual({ cx: 185, cy: 165, zoom: 2 })
  })

  it('keeps the zoom in range', () => {
    const crop = centeredCrop(landscape)
    expect(zoomCrop(crop, landscape, 0.2).zoom).toBe(1)
    expect(zoomCrop(crop, landscape, 99).zoom).toBe(MAX_PHOTO_ZOOM)
  })

  it('pulls the center back inside when zooming out near an edge', () => {
    const corner = { cx: 40, cy: 40, zoom: 4 }
    expect(clampCrop(corner, landscape)).toEqual(corner)
    expect(zoomCrop(corner, landscape, 1)).toEqual({ cx: 150, cy: 150, zoom: 1 })
  })
})
