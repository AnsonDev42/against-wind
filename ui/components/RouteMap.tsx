'use client'

import { useEffect, useRef, useState } from 'react'
import Map, { Source, Layer, MapRef} from 'react-map-gl'
import { loadDemoRouteCoordinates } from '@/lib/demo'

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
  const [mapLoaded, setMapLoaded] = useState(false)
  const [selectedSegment, setSelectedSegment] = useState<any>(null)
  const [tooltipInfo, setTooltipInfo] = useState<{x: number, y: number, data: any} | null>(null)

  // Fetch route coordinates when routeId changes
  useEffect(() => {
    if (routeId) {
      // For demo route, use cached coordinates to avoid backend dependency
      if (routeId === 'demo-glossop-sheffield') {
        loadDemoRouteCoordinates()
          .then(data => {
            if (data) {
              setRouteGeoJSON(data)
            } else {
              // Fallback to API if demo cache fails
              return fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/routes/${routeId}/coordinates`)
                .then(res => res.json())
                .then(data => setRouteGeoJSON(data))
            }
          })
          .catch(err => {
            console.error('Failed to load demo coordinates, trying API:', err)
            // Fallback to API
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/routes/${routeId}/coordinates`)
              .then(res => res.json())
              .then(data => setRouteGeoJSON(data))
              .catch(apiErr => console.error('Failed to fetch route coordinates:', apiErr))
          })
      } else {
        // For non-demo routes, fetch from API
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/routes/${routeId}/coordinates`)
          .then(res => res.json())
          .then(data => {
            setRouteGeoJSON(data)
          })
          .catch(err => console.error('Failed to fetch route coordinates:', err))
      }
    } else {
      setRouteGeoJSON(null)
    }
  }, [routeId])

  // Fit bounds after the map has loaded and route data is ready
  useEffect(() => {
    if (!mapLoaded || !routeGeoJSON || !mapRef.current) return
    const coordinates = routeGeoJSON.features?.[0]?.geometry?.coordinates
    if (!coordinates || coordinates.length === 0) return
    const bounds = coordinates.reduce(
      (b: [[number, number], [number, number]], coord: [number, number]) => [
        [Math.min(b[0][0], coord[0]), Math.min(b[0][1], coord[1])],
        [Math.max(b[1][0], coord[0]), Math.max(b[1][1], coord[1])]
      ],
      [[coordinates[0][0], coordinates[0][1]], [coordinates[0][0], coordinates[0][1]]]
    )
    try {
      mapRef.current.fitBounds(bounds, { padding: 50, duration: 1000 })
    } catch (e) {
      console.warn('fitBounds failed (possibly before style ready):', e)
    }
  }, [mapLoaded, routeGeoJSON])

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
  const routeLineLayer = {
    id: 'route-line',
    type: 'line',
    paint: {
      'line-color': '#374151',
      'line-width': 3,
      'line-opacity': 0.8
    }
  }

  // Wind segments layer with enhanced styling
  const windSegmentsLayer = {
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
        20, 24
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
        onClick={(event) => {
          if (event.features && event.features.length > 0) {
            const feature = event.features[0]
            const props = feature.properties
            if (props) {
              setSelectedSegment(props)
              setTooltipInfo({
                x: event.point.x,
                y: event.point.y,
                data: props
              })
            }
          } else {
            // Click on empty area - close tooltip
            setTooltipInfo(null)
            setSelectedSegment(null)
          }
        }}
        cursor={windSegments ? 'pointer' : 'grab'}
      >
        {/* Route line */}
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            <Layer
              id="route-line"
              type="line"
              paint={{
                'line-color': '#374151',
                'line-width': 3,
                'line-opacity': 0.8,
              }}
            />
          </Source>
        )}

        {/* Wind segments */}
        {windSegments && (
          <Source id="wind-segments" type="geojson" data={windSegments}>
            <Layer
              id="wind-segments"
              type="circle"
              paint={{
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
              }}
            />
          </Source>
        )}

      </Map>

      {/* Custom tooltip for segment details */}
      {tooltipInfo && (
        <div 
          className="absolute pointer-events-none z-50"
          style={{
            left: tooltipInfo.x + 10,
            top: tooltipInfo.y - 10,
            transform: 'translateY(-100%)'
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 p-3 min-w-[200px] relative">
            {/* Close button */}
            <button
              className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 pointer-events-auto"
              onClick={() => {
                setTooltipInfo(null)
                setSelectedSegment(null)
              }}
            >
              ×
            </button>
            
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 pr-6">Wind Details</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Type:</span>
                <span className={`font-medium capitalize ${
                  tooltipInfo.data.windClass === 'head' ? 'text-red-600 dark:text-red-400' :
                  tooltipInfo.data.windClass === 'tail' ? 'text-green-600 dark:text-green-400' :
                  'text-amber-600 dark:text-amber-400'
                }`}>
                  {tooltipInfo.data.windClass}wind
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Speed:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{tooltipInfo.data.windSpeed?.toFixed(1)} m/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Direction:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{tooltipInfo.data.windDirection?.toFixed(0)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Yaw Angle:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{tooltipInfo.data.yawAngle?.toFixed(0)}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Confidence:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{(tooltipInfo.data.confidence * 100)?.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Segment:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">#{tooltipInfo.data.seq}</span>
              </div>
            </div>
            
            {/* Arrow pointing down */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2">
              <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white dark:border-t-gray-800"></div>
              <div className="w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-l-transparent border-r-transparent border-t-gray-300 dark:border-t-gray-600 absolute top-[-7px] left-1/2 transform -translate-x-1/2 -z-10"></div>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isAnalyzing && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Analyzing wind conditions...</p>
          </div>
        </div>
      )}

      {/* Enhanced Map legend */
      }
      {analysisData && (
        <div className="absolute bottom-4 left-4 rounded-lg p-4 max-w-xs bg-gray-50 dark:bg-gray-700">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Wind Analysis</h4>
          <div className="space-y-2 text-sm mb-3 text-gray-700 dark:text-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-4 h-4 rounded-full bg-red-600 mr-2"></div>
                <span className="text-gray-600 dark:text-gray-300">Headwind</span>
              </div>
              <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(analysisData.summary?.head_pct || 0)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-4 h-4 rounded-full bg-amber-600 mr-2"></div>
                <span className="text-gray-600 dark:text-gray-300">Crosswind</span>
              </div>
              <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(analysisData.summary?.cross_pct || 0)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-4 h-4 rounded-full bg-green-600 mr-2"></div>
                <span className="text-gray-600 dark:text-gray-300">Tailwind</span>
              </div>
              <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(analysisData.summary?.tail_pct || 0)}%</span>
            </div>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-600 pt-2">
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
