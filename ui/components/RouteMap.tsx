'use client'

import { useEffect, useRef, useState } from 'react'
import Map, { Source, Layer, MapRef } from 'react-map-gl'
import type { LineLayer, CircleLayer } from 'mapbox-gl'

interface RouteMapProps {
  routeId: string | null
  analysisData: any
  isAnalyzing: boolean
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export function RouteMap({ routeId, analysisData, isAnalyzing }: RouteMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [viewState, setViewState] = useState({
    longitude: -0.1278,
    latitude: 51.5074,
    zoom: 10
  })
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null)

  // Fetch route coordinates when routeId changes
  useEffect(() => {
    if (routeId) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/routes/${routeId}/coordinates`)
        .then(res => res.json())
        .then(data => {
          setRouteGeoJSON(data)
          // Fit map to route bounds
          if (data.features?.[0]?.geometry?.coordinates && mapRef.current) {
            const coordinates = data.features[0].geometry.coordinates
            if (coordinates.length > 0) {
              const bounds = coordinates.reduce(
                (bounds: [[number, number], [number, number]], coord: [number, number]) => [
                  [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
                  [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])]
                ],
                [[coordinates[0][0], coordinates[0][1]], [coordinates[0][0], coordinates[0][1]]]
              )
              mapRef.current.fitBounds(bounds, {
                padding: 50,
                duration: 1000
              })
            }
          }
        })
        .catch(err => console.error('Failed to fetch route coordinates:', err))
    } else {
      setRouteGeoJSON(null)
    }
  }, [routeId])

  // Generate wind segments with colors from analysis data
  const windSegments = analysisData?.segments ? {
    type: 'FeatureCollection' as const,
    features: analysisData.segments
      .filter((segment: any) => segment.lat && segment.lon)
      .map((segment: any, index: number) => ({
        type: 'Feature' as const,
        properties: {
          windClass: segment.wind_class,
          windSpeed: segment.wind_ms1p5m,
          windDirection: segment.wind_dir_deg10m,
          confidence: segment.confidence,
          yawAngle: segment.yaw_deg,
          seq: segment.seq
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [segment.lon, segment.lat]
        }
      }))
  } : null

  // Route line layer
  const routeLineLayer: LineLayer = {
    id: 'route-line',
    type: 'line',
    paint: {
      'line-color': '#374151',
      'line-width': 3,
      'line-opacity': 0.8
    }
  }

  // Wind segments layer with enhanced styling
  const windSegmentsLayer: CircleLayer = {
    id: 'wind-segments',
    type: 'circle',
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['get', 'windSpeed'],
        0, 4,
        5, 8,
        15, 12
      ],
      'circle-color': [
        'match',
        ['get', 'windClass'],
        'head', '#dc2626',     // Red for headwind
        'cross', '#d97706',    // Amber for crosswind
        'tail', '#059669',     // Green for tailwind
        '#6b7280'              // Gray fallback
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.9,
      'circle-stroke-opacity': 1
    }
  }


  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-gray-600 mb-2">Map requires Mapbox token</p>
          <p className="text-sm text-gray-500">
            Set NEXT_PUBLIC_MAPBOX_TOKEN environment variable
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 relative">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/outdoors-v12"
        attributionControl={false}
        interactiveLayerIds={windSegments ? ['wind-segments'] : []}
        onClick={(event) => {
          if (event.features && event.features.length > 0) {
            const feature = event.features[0]
            const props = feature.properties
            if (props) {
              // Show wind details popup
              console.log('Wind segment clicked:', {
                windClass: props.windClass,
                windSpeed: props.windSpeed,
                windDirection: props.windDirection,
                yawAngle: props.yawAngle,
                confidence: props.confidence
              })
            }
          }
        }}
        cursor={windSegments ? 'pointer' : 'grab'}
      >
        {/* Route line */}
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            <Layer {...routeLineLayer} />
          </Source>
        )}

        {/* Wind segments */}
        {windSegments && (
          <Source id="wind-segments" type="geojson" data={windSegments}>
            <Layer {...windSegmentsLayer} />
          </Source>
        )}
      </Map>

      {/* Loading overlay */}
      {isAnalyzing && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Analyzing wind conditions...</p>
          </div>
        </div>
      )}

      {/* Enhanced Map legend */}
      {analysisData && (
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 max-w-xs">
          <h4 className="font-medium text-gray-900 mb-3">Wind Analysis</h4>
          <div className="space-y-2 text-sm mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-4 h-4 rounded-full bg-red-600 mr-2"></div>
                <span>Headwind</span>
              </div>
              <span className="font-medium">{Math.round(analysisData.summary?.head_pct || 0)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-4 h-4 rounded-full bg-amber-600 mr-2"></div>
                <span>Crosswind</span>
              </div>
              <span className="font-medium">{Math.round(analysisData.summary?.cross_pct || 0)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-4 h-4 rounded-full bg-green-600 mr-2"></div>
                <span>Tailwind</span>
              </div>
              <span className="font-medium">{Math.round(analysisData.summary?.tail_pct || 0)}%</span>
            </div>
          </div>
          <div className="text-xs text-gray-500 border-t pt-2">
            <p>Circle size = wind speed</p>
            <p>Click segments for details</p>
          </div>
        </div>
      )}

      {/* No route message */}
      {!routeId && !isAnalyzing && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-lg mb-2">Upload a GPX file to get started</p>
            <p className="text-sm">Analyze wind conditions for your cycling route</p>
          </div>
        </div>
      )}
    </div>
  )
}
