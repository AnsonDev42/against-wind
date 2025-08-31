'use client'

import { useMemo, useRef, useState } from 'react'
import Map, { Layer, MapRef, Source } from 'react-map-gl'
import { useRouteData } from '@/lib/hooks/useRouteData'
import { useMapFitBounds } from '@/lib/hooks/useMapFitBounds'
import { WindAnalysisLegend } from './map/WindAnalysisLegend'
import { WindSegmentTooltip } from './map/WindSegmentTooltip'
import { MapOverlay } from './map/MapOverlay'

interface RouteMapProps {
  routeId: string | null
  analysisData: any
  isAnalyzing: boolean
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

const initialViewState = {
  longitude: -0.1278,
  latitude: 51.5074,
  zoom: 10,
}

const routeLineLayer: any = {
  id: 'route-line',
  type: 'line',
  paint: {
    'line-color': '#374151',
    'line-width': 3,
    'line-opacity': 0.8,
  },
}

const windSegmentsLayer: any = {
  id: 'wind-segments',
  type: 'circle',
  paint: {
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['get', 'windSpeed'],
      0, 6,
      5, 10,
      10, 16,
      20, 24,
    ],
    'circle-color': [
      'match',
      ['get', 'windClass'],
      'head', '#dc2626',
      'cross', '#d97706',
      'tail', '#059669',
      '#6b7280',
    ],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
    'circle-opacity': 0.9,
    'circle-stroke-opacity': 1,
  },
}

export function RouteMap({ routeId, analysisData, isAnalyzing }: RouteMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [viewState, setViewState] = useState(initialViewState)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [tooltipInfo, setTooltipInfo] = useState<{ x: number; y: number; data: any } | null>(null)

  const routeGeoJSON = useRouteData(routeId)
  useMapFitBounds(mapRef, routeGeoJSON, mapLoaded)

  const windSegments = useMemo(() => {
    if (!analysisData?.segments) return null
    return {
      type: 'FeatureCollection' as const,
      features: analysisData.segments
        .filter((segment: any) => segment.lat && segment.lon)
        .map((segment: any) => ({
          type: 'Feature' as const,
          properties: {
            windClass: segment.wind_class,
            windSpeed: segment.wind_ms1p5m,
            windDirection: segment.wind_dir_deg10m,
            confidence: segment.confidence,
            yawAngle: segment.yaw_deg,
            seq: segment.seq,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [segment.lon, segment.lat],
          },
        })),
    }
  }, [analysisData])

  const handleMapClick = (event: any) => {
    if (event.features && event.features.length > 0) {
      const feature = event.features[0]
      if (feature.properties) {
        setTooltipInfo({
          x: event.point.x,
          y: event.point.y,
          data: feature.properties,
        })
      }
    } else {
      setTooltipInfo(null)
    }
  }

  if (!MAPBOX_TOKEN) {
    return <MapOverlay isAnalyzing={false} routeId={null} isMapboxTokenSet={false} />
  }

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/outdoors-v12"
        attributionControl={false}
        onLoad={() => setMapLoaded(true)}
        interactiveLayerIds={windSegments ? ['wind-segments'] : []}
        onClick={handleMapClick}
        cursor={windSegments ? 'pointer' : 'grab'}
      >
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            <Layer {...routeLineLayer} />
          </Source>
        )}

        {windSegments && (
          <Source id="wind-segments" type="geojson" data={windSegments}>
            <Layer {...windSegmentsLayer} />
          </Source>
        )}
      </Map>

      <WindSegmentTooltip tooltipInfo={tooltipInfo} onClose={() => setTooltipInfo(null)} />

      <MapOverlay isAnalyzing={isAnalyzing} routeId={routeId} isMapboxTokenSet={true} />

      <WindAnalysisLegend analysisData={analysisData} />
    </div>
  )
}
