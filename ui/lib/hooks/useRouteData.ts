import { useState, useEffect } from 'react';
import { loadDemoRouteCoordinates } from '@/lib/demo';

export function useRouteData(routeId: string | null) {
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);

  useEffect(() => {
    if (!routeId) {
      setRouteGeoJSON(null);
      return;
    }

    const fetchRouteData = async () => {
      try {
        let data;
        if (routeId === 'demo-glossop-sheffield') {
          data = await loadDemoRouteCoordinates();
          if (!data) {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/routes/${routeId}/coordinates`);
            data = await res.json();
          }
        } else {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/routes/${routeId}/coordinates`);
          data = await res.json();
        }
        setRouteGeoJSON(data);
      } catch (error) {
        console.error('Failed to fetch route coordinates:', error);
        setRouteGeoJSON(null);
      }
    };

    fetchRouteData();
  }, [routeId]);

  return routeGeoJSON;
}
