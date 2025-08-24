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

  // Generate route line from analysis data
  const routeGeoJSON = analysisData?.segments ? {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: analysisData.segments.map((segment: any) => [
          segment.lon || 0, // These would come from the route data
          segment.lat || 0
        ])
      }
    }]
  } : null

  // Generate wind segments with colors
  const windSegments = analysisData?.segments ? {
    type: 'FeatureCollection' as const,
    features: analysisData.segments.map((segment: any, index: number) => ({
      type: 'Feature' as const,
      properties: {
        windClass: segment.wind_class,
        windSpeed: segment.wind_ms1p5m,
        windDirection: segment.wind_dir_deg10m,
        confidence: segment.confidence,
        yawAngle: segment.yaw_deg
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [segment.lon || 0, segment.lat || 0]
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

  // Wind segments layer
  const windSegmentsLayer: CircleLayer = {
    id: 'wind-segments',
    type: 'circle',
    paint: {
      'circle-radius': 6,
      'circle-color': [
        'match',
        ['get', 'windClass'],
        'head', '#ef4444',
        'cross', '#f59e0b', 
        'tail', '#10b981',
        '#6b7280'
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.8
    }
  }

  // Fit map to route bounds when analysis data changes
  useEffect(() => {
    if (analysisData?.segments && mapRef.current) {
      const coordinates = analysisData.segments
        .map((segment: any) => [segment.lon || 0, segment.lat || 0])
        .filter((coord: number[]) => coord[0] !== 0 && coord[1] !== 0)

      if (coordinates.length > 0) {
        const bounds = coordinates.reduce(
          (bounds, coord) => [
            [Math.min(bounds[0][0], coord[0]), Math.min(bounds[0][1], coord[1])],
            [Math.max(bounds[1][0], coord[0]), Math.max(bounds[1][1], coord[1])]
          ],
          [[coordinates[0][0], coordinates[0][1]], [coordinates[0][0], coordinates[0][1]]]
        )

        mapRef.current.fitBounds(bounds as [[number, number], [number, number]], {
          padding: 50,
          duration: 1000
        })
      }
    }
  }, [analysisData])

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

      {/* Map legend */}
      {analysisData && (
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Wind Conditions</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-red-500 mr-2"></div>
              <span>Headwind</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-amber-500 mr-2"></div>
              <span>Crosswind</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded-full bg-green-500 mr-2"></div>
              <span>Tailwind</span>
            </div>
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
