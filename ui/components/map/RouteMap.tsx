'use client'

import { KeyboardEvent, MouseEvent, PointerEvent, useMemo, useRef, useState } from 'react'
import { Map, Satellite } from 'lucide-react'
import { useRouteData } from '@/lib/hooks/useRouteData'
import { WindAnalysisLegend } from '@/components/map/WindAnalysisLegend'
import { WindSegmentTooltip } from '@/components/map/WindSegmentTooltip'
import { MapOverlay } from '@/components/map/MapOverlay'

interface RouteMapProps {
  routeId: string | null
  analysisData: any
  isAnalyzing: boolean
}

type Coordinate = [number, number]

interface ProjectedWindSegment {
  x: number
  y: number
  radius: number
  color: string
  label: string
  data: {
    windClass: string
    windSpeed: number
    windDirection: number
    confidence: number
    yawAngle: number
    seq: number
  }
}

interface ScreenPoint {
  x: number
  y: number
}

type MapLayerId = 'streets' | 'satellite'

interface MapLayer {
  id: MapLayerId
  label: string
  icon: typeof Map
  attribution: string
  getTileUrl: (zoom: number, x: number, y: number) => string
}

const VIEWPORT_WIDTH = 1000
const VIEWPORT_HEIGHT = 700
const TILE_SIZE = 256
const TILE_BUFFER = 1
const MAX_PAN_PX = 700

const MAP_LAYERS: MapLayer[] = [
  {
    id: 'streets',
    label: 'Streets',
    icon: Map,
    attribution: '© OpenStreetMap contributors',
    getTileUrl: (zoom, x, y) => `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
  },
  {
    id: 'satellite',
    label: 'Satellite',
    icon: Satellite,
    attribution: 'Tiles © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    getTileUrl: (zoom, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`,
  },
]

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

const lonToWorldX = (lon: number, zoom: number) => ((lon + 180) / 360) * TILE_SIZE * 2 ** zoom

const latToWorldY = (lat: number, zoom: number) => {
  const boundedLat = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const sinLat = Math.sin((boundedLat * Math.PI) / 180)

  return (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * TILE_SIZE * 2 ** zoom
}

const project = ([lon, lat]: Coordinate, zoom: number) => ({
  x: lonToWorldX(lon, zoom),
  y: latToWorldY(lat, zoom),
})

const windClassColor = (windClass: string) => {
  switch (windClass) {
    case 'head':
      return '#dc2626'
    case 'tail':
      return '#059669'
    case 'cross':
      return '#d97706'
    default:
      return '#6b7280'
  }
}

const windClassLabel = (windClass: string) => {
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

const chooseZoom = (coordinates: Coordinate[]) => {
  for (let zoom = 15; zoom >= 4; zoom -= 1) {
    const points = coordinates.map(coordinate => project(coordinate, zoom))
    const xs = points.map(point => point.x)
    const ys = points.map(point => point.y)
    const width = Math.max(...xs) - Math.min(...xs)
    const height = Math.max(...ys) - Math.min(...ys)

    if (width <= VIEWPORT_WIDTH * 0.78 && height <= VIEWPORT_HEIGHT * 0.72) {
      return zoom
    }
  }

  return 4
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const closestRoutePoint = (point: ScreenPoint, routePoints: ScreenPoint[]) => {
  if (routePoints.length === 0) return point

  return routePoints.reduce((closest, candidate) => {
    const candidateDistance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2
    const closestDistance = (closest.x - point.x) ** 2 + (closest.y - point.y) ** 2

    return candidateDistance < closestDistance ? candidate : closest
  }, routePoints[0])
}

export function RouteMap({ routeId, analysisData, isAnalyzing }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ pointerId: number; x: number; y: number; pan: ScreenPoint } | null>(null)
  const [tooltipInfo, setTooltipInfo] = useState<{ x: number; y: number; data: any } | null>(null)
  const [pan, setPan] = useState<ScreenPoint>({ x: 0, y: 0 })
  const [mapLayerId, setMapLayerId] = useState<MapLayerId>('streets')
  const routeGeoJSON = useRouteData(routeId)
  const mapLayer = MAP_LAYERS.find(layer => layer.id === mapLayerId) ?? MAP_LAYERS[0]

  const map = useMemo(() => {
    const coordinates = extractRouteCoordinates(routeGeoJSON).filter(
      coordinate => Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]),
    )

    if (coordinates.length === 0) {
      return null
    }

    const zoom = chooseZoom(coordinates)
    const worldPoints = coordinates.map(coordinate => project(coordinate, zoom))
    const xs = worldPoints.map(point => point.x)
    const ys = worldPoints.map(point => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const baseTopLeft = {
      x: (minX + maxX - VIEWPORT_WIDTH) / 2,
      y: (minY + maxY - VIEWPORT_HEIGHT) / 2,
    }
    const topLeft = {
      x: baseTopLeft.x - pan.x,
      y: baseTopLeft.y - pan.y,
    }
    const maxTile = 2 ** zoom - 1
    const minTileX = Math.max(0, Math.floor(topLeft.x / TILE_SIZE) - TILE_BUFFER)
    const maxTileX = Math.min(maxTile, Math.floor((topLeft.x + VIEWPORT_WIDTH) / TILE_SIZE) + TILE_BUFFER)
    const minTileY = Math.max(0, Math.floor(topLeft.y / TILE_SIZE) - TILE_BUFFER)
    const maxTileY = Math.min(maxTile, Math.floor((topLeft.y + VIEWPORT_HEIGHT) / TILE_SIZE) + TILE_BUFFER)
    const tiles = []

    for (let x = minTileX; x <= maxTileX; x += 1) {
      for (let y = minTileY; y <= maxTileY; y += 1) {
        tiles.push({
          key: `${mapLayer.id}-${zoom}-${x}-${y}`,
          src: mapLayer.getTileUrl(zoom, x, y),
          left: x * TILE_SIZE - topLeft.x,
          top: y * TILE_SIZE - topLeft.y,
        })
      }
    }

    const toViewport = (coordinate: Coordinate) => {
      const point = project(coordinate, zoom)

      return {
        x: point.x - topLeft.x,
        y: point.y - topLeft.y,
      }
    }
    const routePoints = coordinates.map(toViewport)
    const path = routePoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

    return { path, routePoints, tiles, toViewport }
  }, [mapLayer, pan, routeGeoJSON])

  const windSegments = useMemo<ProjectedWindSegment[]>(() => {
    if (!map || !analysisData?.segments) return []

    return analysisData.segments
      .filter((segment: any) => Number.isFinite(segment.lon) && Number.isFinite(segment.lat))
      .map((segment: any) => {
        const rawPoint = map.toViewport([segment.lon, segment.lat])
        const point = closestRoutePoint(rawPoint, map.routePoints)
        const windSpeed = Number(segment.wind_ms1p5m) || 0

        return {
          x: point.x,
          y: point.y,
          radius: Math.min(24, Math.max(7, 7 + windSpeed * 0.9)),
          color: windClassColor(segment.wind_class),
          label: windClassLabel(segment.wind_class),
          data: {
            windClass: segment.wind_class,
            windSpeed,
            windDirection: segment.wind_dir_deg10m,
            confidence: segment.confidence,
            yawAngle: segment.yaw_deg,
            seq: segment.seq,
          },
        }
      })
  }, [analysisData, map])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-map-control="true"]')) return

    dragStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pan,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current
    if (!dragStart || dragStart.pointerId !== event.pointerId) return

    setTooltipInfo(null)
    setPan({
      x: clamp(dragStart.pan.x + event.clientX - dragStart.x, -MAX_PAN_PX, MAX_PAN_PX),
      y: clamp(dragStart.pan.y + event.clientY - dragStart.y, -MAX_PAN_PX, MAX_PAN_PX),
    })
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current?.pointerId === event.pointerId) {
      dragStartRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const showTooltip = (
    event: MouseEvent<SVGCircleElement> | KeyboardEvent<SVGCircleElement>,
    segment: ProjectedWindSegment,
  ) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    setTooltipInfo({
      x: (segment.x / VIEWPORT_WIDTH) * rect.width,
      y: (segment.y / VIEWPORT_HEIGHT) * rect.height,
      data: segment.data,
    })
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab overflow-hidden bg-slate-100 active:cursor-grabbing dark:bg-gray-900"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {map && (
        <>
          <div className="absolute inset-0">
            {map.tiles.map(tile => (
              <img
                key={tile.key}
                src={tile.src}
                alt=""
                className="absolute select-none"
                draggable={false}
                style={{
                  left: `${(tile.left / VIEWPORT_WIDTH) * 100}%`,
                  top: `${(tile.top / VIEWPORT_HEIGHT) * 100}%`,
                  width: `${(TILE_SIZE / VIEWPORT_WIDTH) * 100}%`,
                  height: `${(TILE_SIZE / VIEWPORT_HEIGHT) * 100}%`,
                }}
              />
            ))}
          </div>

          <svg
            role="img"
            aria-label="Cycling route map"
            viewBox={`0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}`}
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            onClick={() => setTooltipInfo(null)}
          >
            <path
              d={map.path}
              fill="none"
              stroke="#ffffff"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.95"
            />
            <path
              d={map.path}
              fill="none"
              stroke="#374151"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {windSegments.map(segment => (
              <circle
                key={`${segment.data.seq}-${segment.x}-${segment.y}`}
                cx={segment.x}
                cy={segment.y}
                r={segment.radius}
                fill={segment.color}
                stroke="#ffffff"
                strokeWidth="4"
                role="button"
                tabIndex={0}
                aria-label={`${segment.label} segment ${segment.data.seq}`}
                data-map-control="true"
                className="cursor-pointer transition-opacity hover:opacity-80 focus:outline-none"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation()
                  showTooltip(event, segment)
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    showTooltip(event, segment)
                  }
                }}
              />
            ))}
          </svg>

          <div
            className="absolute right-3 top-3 z-20 flex rounded-md border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/90"
            data-map-control="true"
            aria-label="Map style"
          >
            {MAP_LAYERS.map(layer => {
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
        </>
      )}

      <div className="absolute bottom-1 right-2 z-10 max-w-[calc(100%-1rem)] rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-gray-700 dark:bg-gray-900/75 dark:text-gray-200">
        {mapLayer.attribution}
      </div>

      <WindSegmentTooltip tooltipInfo={tooltipInfo} onClose={() => setTooltipInfo(null)} />
      <MapOverlay isAnalyzing={isAnalyzing} routeId={routeId} />
      <WindAnalysisLegend analysisData={analysisData} />
    </div>
  )
}
