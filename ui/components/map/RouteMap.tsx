'use client'

import { useMemo, useRef, useState } from 'react'
import { Map, Satellite } from 'lucide-react'
import MapboxMap, {
  Layer as MapboxLayer,
  NavigationControl as MapboxNavigationControl,
  Popup as MapboxPopup,
  Source as MapboxSource,
} from 'react-map-gl/mapbox'
import MapLibreMap, {
  Layer as MapLibreLayer,
  NavigationControl as MapLibreNavigationControl,
  Popup as MapLibrePopup,
  Source as MapLibreSource,
} from 'react-map-gl/maplibre'
import { useRouteData } from '@/lib/hooks/useRouteData'
import { useMapFitBounds } from '@/lib/hooks/useMapFitBounds'
import { WindAnalysisLegend } from '@/components/map/WindAnalysisLegend'
import { MapOverlay } from '@/components/map/MapOverlay'

interface RouteMapProps {
  routeId: string | null
  analysisData: any
  isAnalyzing: boolean
}

type Coordinate = [number, number]
type MapLayerId = 'streets' | 'satellite'

interface BaseMapLayer {
  id: MapLayerId
  label: string
  icon: typeof Map
  attribution: string
  mapboxStyle: string
  tiles: string[]
}

interface SelectedWindSegment {
  longitude: number
  latitude: number
  data: {
    windClass: string
    windSpeed: number
    windDirection: number
    confidence: number
    yawAngle: number
    seq: number
  }
}

const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const MapComponent = (mapboxToken ? MapboxMap : MapLibreMap) as any
const SourceComponent = (mapboxToken ? MapboxSource : MapLibreSource) as any
const LayerComponent = (mapboxToken ? MapboxLayer : MapLibreLayer) as any
const NavigationControlComponent = (
  mapboxToken ? MapboxNavigationControl : MapLibreNavigationControl
) as any
const PopupComponent = (mapboxToken ? MapboxPopup : MapLibrePopup) as any

const BASE_MAP_LAYERS: BaseMapLayer[] = [
  {
    id: 'streets',
    label: 'Streets',
    icon: Map,
    attribution: '&copy; OpenStreetMap contributors',
    mapboxStyle: 'mapbox://styles/mapbox/outdoors-v12',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  },
  {
    id: 'satellite',
    label: 'Satellite',
    icon: Satellite,
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    mapboxStyle: 'mapbox://styles/mapbox/satellite-streets-v12',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
  },
]

const createRasterStyle = (layer: BaseMapLayer) => ({
  version: 8,
  sources: {
    [layer.id]: {
      type: 'raster',
      tiles: layer.tiles,
      tileSize: 256,
      attribution: layer.attribution,
    },
  },
  layers: [
    {
      id: `${layer.id}-tiles`,
      type: 'raster',
      source: layer.id,
    },
  ],
})

const routeHaloLayer: any = {
  id: 'route-line-halo',
  type: 'line',
  paint: {
    'line-color': '#ffffff',
    'line-width': 9,
    'line-opacity': 0.95,
  },
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
}

const routeLayer: any = {
  id: 'route-line',
  type: 'line',
  paint: {
    'line-color': '#374151',
    'line-width': 5,
  },
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
}

const windSegmentLayer: any = {
  id: 'wind-segments',
  type: 'circle',
  paint: {
    'circle-color': [
      'match',
      ['get', 'windClass'],
      'head',
      '#dc2626',
      'tail',
      '#059669',
      'cross',
      '#d97706',
      '#6b7280',
    ],
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['coalesce', ['to-number', ['get', 'windSpeed']], 0],
      0,
      7,
      8,
      14,
      18,
      24,
    ],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 3,
    'circle-opacity': 0.95,
  },
}

const extractRouteCoordinates = (geoJson: any): Coordinate[] => {
  if (!geoJson) return []

  if (geoJson.type === 'FeatureCollection') {
    return geoJson.features.flatMap((feature: any) => extractRouteCoordinates(feature))
  }

  if (geoJson.type === 'Feature') {
    return extractRouteCoordinates(geoJson.geometry)
  }

  if (geoJson.type === 'LineString') {
    return geoJson.coordinates
  }

  if (geoJson.type === 'MultiLineString') {
    return geoJson.coordinates.flat()
  }

  return []
}

const toNumber = (value: unknown, fallback = 0) => {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : fallback
}

const formatWindClass = (windClass: string) => {
  switch (windClass) {
    case 'head':
      return 'Headwind'
    case 'tail':
      return 'Tailwind'
    case 'cross':
      return 'Crosswind'
    default:
      return 'Wind'
  }
}

export function RouteMap({ routeId, analysisData, isAnalyzing }: RouteMapProps) {
  const mapRef = useRef<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [cursor, setCursor] = useState('')
  const [mapLayerId, setMapLayerId] = useState<MapLayerId>('streets')
  const [selectedSegment, setSelectedSegment] = useState<SelectedWindSegment | null>(null)
  const routeGeoJSON = useRouteData(routeId)
  const baseMapLayer = BASE_MAP_LAYERS.find(layer => layer.id === mapLayerId) ?? BASE_MAP_LAYERS[0]

  useMapFitBounds(mapRef, routeGeoJSON, mapLoaded)

  const mapStyle = useMemo(
    () => (mapboxToken ? baseMapLayer.mapboxStyle : createRasterStyle(baseMapLayer)),
    [baseMapLayer],
  )

  const routeSource = useMemo(() => {
    if (!routeGeoJSON || extractRouteCoordinates(routeGeoJSON).length === 0) return null

    return routeGeoJSON
  }, [routeGeoJSON])

  const initialViewState = useMemo(() => {
    const coordinates = extractRouteCoordinates(routeGeoJSON)

    if (coordinates.length === 0) {
      return {
        longitude: -1.75,
        latitude: 53.4,
        zoom: 8,
      }
    }

    const totals = coordinates.reduce(
      (acc, coordinate) => ({
        longitude: acc.longitude + coordinate[0],
        latitude: acc.latitude + coordinate[1],
      }),
      { longitude: 0, latitude: 0 },
    )

    return {
      longitude: totals.longitude / coordinates.length,
      latitude: totals.latitude / coordinates.length,
      zoom: 9,
    }
  }, [routeGeoJSON])

  const windSegmentsGeoJSON = useMemo(() => {
    const features =
      analysisData?.segments
        ?.filter((segment: any) => Number.isFinite(segment.lon) && Number.isFinite(segment.lat))
        .map((segment: any) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [segment.lon, segment.lat],
          },
          properties: {
            windClass: segment.wind_class,
            windSpeed: toNumber(segment.wind_ms1p5m),
            windDirection: toNumber(segment.wind_dir_deg10m),
            confidence: toNumber(segment.confidence),
            yawAngle: toNumber(segment.yaw_deg),
            seq: toNumber(segment.seq),
          },
        })) ?? []

    return {
      type: 'FeatureCollection',
      features,
    }
  }, [analysisData])

  const handleClick = (event: any) => {
    const feature = event.features?.find((clickedFeature: any) => clickedFeature.layer?.id === windSegmentLayer.id)

    if (!feature || feature.geometry.type !== 'Point') {
      setSelectedSegment(null)
      return
    }

    const [longitude, latitude] = feature.geometry.coordinates as Coordinate
    const properties = feature.properties ?? {}

    setSelectedSegment({
      longitude,
      latitude,
      data: {
        windClass: String(properties.windClass ?? 'wind'),
        windSpeed: toNumber(properties.windSpeed),
        windDirection: toNumber(properties.windDirection),
        confidence: toNumber(properties.confidence),
        yawAngle: toNumber(properties.yawAngle),
        seq: toNumber(properties.seq),
      },
    })
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-gray-900">
      <MapComponent
        ref={mapRef}
        initialViewState={initialViewState}
        {...(mapboxToken ? { mapboxAccessToken: mapboxToken } : {})}
        mapStyle={mapStyle}
        style={{ width: '100%', height: '100%' }}
        cursor={cursor}
        dragRotate={false}
        touchPitch={false}
        interactiveLayerIds={[windSegmentLayer.id]}
        onLoad={() => setMapLoaded(true)}
        onClick={handleClick}
        onMouseEnter={() => setCursor('pointer')}
        onMouseLeave={() => setCursor('')}
      >
        <NavigationControlComponent position="top-right" showCompass={false} />

        {routeSource && (
          <SourceComponent id="route" type="geojson" data={routeSource}>
            <LayerComponent {...routeHaloLayer} />
            <LayerComponent {...routeLayer} />
          </SourceComponent>
        )}

        {windSegmentsGeoJSON.features.length > 0 && (
          <SourceComponent id="wind-segment-points" type="geojson" data={windSegmentsGeoJSON}>
            <LayerComponent {...windSegmentLayer} />
          </SourceComponent>
        )}

        {selectedSegment && (
          <PopupComponent
            longitude={selectedSegment.longitude}
            latitude={selectedSegment.latitude}
            closeButton
            closeOnClick={false}
            anchor="top"
            offset={12}
            onClose={() => setSelectedSegment(null)}
          >
            <div className="min-w-[190px] text-sm text-gray-900">
              <h4 className="mb-2 font-semibold">Wind Details</h4>
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium">{formatWindClass(selectedSegment.data.windClass)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Speed:</span>
                  <span className="font-medium">{selectedSegment.data.windSpeed.toFixed(1)} m/s</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Direction:</span>
                  <span className="font-medium">{selectedSegment.data.windDirection.toFixed(0)}°</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Yaw Angle:</span>
                  <span className="font-medium">{selectedSegment.data.yawAngle.toFixed(0)}°</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Confidence:</span>
                  <span className="font-medium">{(selectedSegment.data.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Segment:</span>
                  <span className="font-medium">#{selectedSegment.data.seq}</span>
                </div>
              </div>
            </div>
          </PopupComponent>
        )}
      </MapComponent>

      <div
        className="absolute left-3 top-3 z-20 flex rounded-md border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/90"
        data-map-control="true"
        aria-label="Map style"
      >
        {BASE_MAP_LAYERS.map(layer => {
          const Icon = layer.icon
          const isActive = layer.id === mapLayerId

          return (
            <button
              key={layer.id}
              type="button"
              className={`inline-flex h-9 items-center gap-1.5 rounded px-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900 ${
                isActive
                  ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
              }`}
              aria-pressed={isActive}
              title={`Show ${layer.label.toLowerCase()} map`}
              onClick={() => setMapLayerId(layer.id)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{layer.label}</span>
            </button>
          )
        })}
      </div>

      <MapOverlay isAnalyzing={isAnalyzing} routeId={routeId} />
      <WindAnalysisLegend analysisData={analysisData} />
    </div>
  )
}
