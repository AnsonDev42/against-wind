'use client'

import { useState, useEffect } from 'react'
import { RouteMetadata, TimingMode } from '@/lib/types/analysis'

export function useRouteMetadata(routeId: string) {
  const [routeMetadata, setRouteMetadata] = useState<RouteMetadata | null>(null)
  const [timingMode, setTimingMode] = useState<TimingMode>('manual')
  const [departTime, setDepartTime] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(8, 0, 0, 0)
    return tomorrow.toISOString().slice(0, 16)
  })
  const [useHistoricalMode, setUseHistoricalMode] = useState<boolean>(false)
  const [estimatedDuration, setEstimatedDuration] = useState<number>(3)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  useEffect(() => {
    const fetchRouteMetadata = async () => {
      if (!routeId) return

      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/routes/${routeId}/metadata`)
        if (response.ok) {
          const metadata: RouteMetadata = await response.json()
          setRouteMetadata(metadata)

          // Auto-set timing mode based on route capabilities
          if (metadata.has_timestamps && metadata.timestamp_coverage > 0.8) {
            setTimingMode('gpx_timestamps')
            // Set departure time to GPX start time if available
            if (metadata.start_time) {
              const gpxStartTime = new Date(metadata.start_time)
              setDepartTime(gpxStartTime.toISOString().slice(0, 16))

              // Auto-enable historical mode if GPX start time is in the past
              const now = new Date()
              if (gpxStartTime < now) {
                setUseHistoricalMode(true)
              }
            }
          } else {
            setTimingMode('manual')
          }

          // Set estimated duration from metadata
          if (metadata.estimated_duration_hours) {
            setEstimatedDuration(Math.round(metadata.estimated_duration_hours * 10) / 10)
          }
        } else {
          setError('Failed to fetch route metadata.')
        }
      } catch (error) {
        console.error('Failed to fetch route metadata:', error)
        setError('Failed to fetch route metadata.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchRouteMetadata()
  }, [routeId])

  return {
    routeMetadata,
    timingMode,
    setTimingMode,
    departTime,
    setDepartTime,
    useHistoricalMode,
    setUseHistoricalMode,
    estimatedDuration,
    setEstimatedDuration,
    isLoading,
    error,
  }
}
