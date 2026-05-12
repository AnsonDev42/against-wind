import { RefObject, useEffect } from 'react'

type Coordinate = [number, number]
type MapHandle = {
  fitBounds: (bounds: [Coordinate, Coordinate], options: { padding: number; duration: number }) => void
}

const extractCoordinates = (geoJson: any): Coordinate[] => {
  if (!geoJson) return []

  if (geoJson.type === 'FeatureCollection') {
    return geoJson.features.flatMap((feature: any) => extractCoordinates(feature))
  }

  if (geoJson.type === 'Feature') {
    return extractCoordinates(geoJson.geometry)
  }

  if (geoJson.type === 'LineString') {
    return geoJson.coordinates
  }

  if (geoJson.type === 'MultiLineString') {
    return geoJson.coordinates.flat()
  }

  return []
}

export function useMapFitBounds(
  mapRef: RefObject<MapHandle | null>,
  geoJSON: any,
  mapLoaded: boolean,
) {
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return

    const coordinates = extractCoordinates(geoJSON).filter(
      coordinate => Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]),
    )
    if (coordinates.length === 0) return

    const bounds = coordinates.reduce<[Coordinate, Coordinate]>(
      (acc: [Coordinate, Coordinate], coordinate) => [
        [Math.min(acc[0][0], coordinate[0]), Math.min(acc[0][1], coordinate[1])],
        [Math.max(acc[1][0], coordinate[0]), Math.max(acc[1][1], coordinate[1])],
      ],
      [
        [coordinates[0][0], coordinates[0][1]],
        [coordinates[0][0], coordinates[0][1]],
      ],
    )

    try {
      mapRef.current.fitBounds(bounds, { padding: 70, duration: 800 })
    } catch (error) {
      console.warn('fitBounds failed:', error)
    }
  }, [mapLoaded, geoJSON, mapRef])
}
