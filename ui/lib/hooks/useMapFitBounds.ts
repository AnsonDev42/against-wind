import { useEffect } from 'react';
import { MapRef } from 'react-map-gl';

export function useMapFitBounds(
  mapRef: React.RefObject<MapRef | null>,
  geoJSON: any,
  mapLoaded: boolean
) {
  useEffect(() => {
    if (!mapLoaded || !geoJSON || !mapRef.current) return;

    const coordinates = geoJSON.features?.[0]?.geometry?.coordinates;
    if (!coordinates || coordinates.length === 0) return;

    const bounds = coordinates.reduce(
      (b: [[number, number], [number, number]], coord: [number, number]) => [
        [Math.min(b[0][0], coord[0]), Math.min(b[0][1], coord[1])],
        [Math.max(b[1][0], coord[0]), Math.max(b[1][1], coord[1])],
      ],
      [[coordinates[0][0], coordinates[0][1]], [coordinates[0][0], coordinates[0][1]]]
    );

    try {
      mapRef.current.fitBounds(bounds, { padding: 50, duration: 1000 });
    } catch (e) {
      console.warn('fitBounds failed (possibly before style ready):', e);
    }
  }, [mapLoaded, geoJSON, mapRef]);
}
