'use client'

import { useState, useEffect } from 'react'
import { PlayIcon, ArrowPathIcon, ClockIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import {Button} from "@/components/ui/button";

interface AnalysisPanelProps {
  routeId: string
  isAnalyzing: boolean
  analysisData: any
  onAnalysisStart: () => void
  onAnalysisComplete: (data: any) => void
  onAnalysisError: (error: string) => void
  onReset: () => void
}

export function AnalysisPanel({
  routeId,
  isAnalyzing,
  analysisData,
  onAnalysisStart,
  onAnalysisComplete,
  onAnalysisError,
  onReset
}: AnalysisPanelProps) {
  const [departTime, setDepartTime] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(8, 0, 0, 0)
    return tomorrow.toISOString().slice(0, 16)
  })
  const [provider, setProvider] = useState('open-meteo')
  const [progress, setProgress] = useState<any>(null)
  const [routeMetadata, setRouteMetadata] = useState<any>(null)
  const [timingMode, setTimingMode] = useState<'manual' | 'gpx_timestamps' | 'estimated'>('manual')
  const [estimatedDuration, setEstimatedDuration] = useState<number>(3)
  const [useHistoricalMode, setUseHistoricalMode] = useState<boolean>(false)

  // Fetch route metadata when routeId changes
  useEffect(() => {
    const fetchRouteMetadata = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/routes/${routeId}/metadata`)
        if (response.ok) {
          const metadata = await response.json()
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
        }
      } catch (error) {
        console.error('Failed to fetch route metadata:', error)
      }
    }

    if (routeId) {
      fetchRouteMetadata()
    }
  }, [routeId])

  const handleAnalyze = async () => {
    onAnalysisStart()
    setProgress(null)

    try {
      const departISO = new Date(departTime).toISOString()
      
      // Build URL with timing mode parameters
      const params = new URLSearchParams({
        route_id: routeId,
        depart: departISO,
        provider: provider,
        use_gpx_timestamps: (timingMode === 'gpx_timestamps').toString(),
        use_historical_mode: (useHistoricalMode && timingMode === 'gpx_timestamps').toString(),
      })
      
      if (timingMode === 'estimated') {
        params.append('estimated_duration_hours', estimatedDuration.toString())
      }
      
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/analyze?${params.toString()}`
      
      const eventSource = new EventSource(url)


      eventSource.addEventListener('progress', (event: MessageEvent) => {
        const data = JSON.parse(event.data)
        setProgress(data)
      })

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        const data = JSON.parse(event.data)
        onAnalysisComplete(data)
        // Hide progress once completed
        setProgress(null)
        eventSource.close()
      })

      // Handle server-sent error events (custom SSE event: "error").
      // Important: The browser also dispatches native connection error events named 'error'
      // which do NOT carry a data payload. We must guard against those here and let
      // the dedicated onerror handler below manage connection issues.
      eventSource.addEventListener('error', (event: MessageEvent) => {
        try {
          const raw = (event as any)?.data
          if (typeof raw !== 'string') {
            // Likely a native connection error event; ignore here.
            return
          }
          const data = JSON.parse(raw)
          onAnalysisError(data.message || 'Analysis failed')
          // Hide progress on error
          setProgress(null)
          eventSource.close()
        } catch {
          // If parsing fails, ignore and let the native onerror handle it
          // to avoid prematurely closing a valid stream.
        }
      })

      eventSource.onerror = () => {
        onAnalysisError('Connection error')
        // Hide progress on connection error
        setProgress(null)
        eventSource.close()
      }

    } catch (err) {
      onAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Wind Analysis</h3>
        <Button
          onClick={onReset}
          variant="secondary"
          // className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Upload new route
        </Button>
      </div>

      <div className="space-y-4">
        {/* Timing Mode Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Timing Mode
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="timing-mode"
                value="manual"
                checked={timingMode === 'manual'}
                onChange={(e) => setTimingMode(e.target.value as any)}
                className="mr-2"
                disabled={isAnalyzing}
              />
              <ClockIcon className="h-4 w-4 mr-1" />
              <span className="text-sm text-gray-800 dark:text-gray-200">Manual departure time</span>
            </label>
            
            {routeMetadata?.has_timestamps && (
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="timing-mode"
                    value="gpx_timestamps"
                    checked={timingMode === 'gpx_timestamps'}
                    onChange={(e) => setTimingMode(e.target.value as any)}
                    className="mr-2"
                    disabled={isAnalyzing}
                  />
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  <span className="text-sm text-gray-800 dark:text-gray-200">Use GPX timestamps</span>
                  {routeMetadata.timestamp_coverage < 1.0 && (
                    <span className="ml-1 text-xs text-amber-600">
                      ({Math.round(routeMetadata.timestamp_coverage * 100)}% coverage)
                    </span>
                  )}
                </label>
                
                {timingMode === 'gpx_timestamps' && (
                  <div className="ml-6 pl-2 border-l-2 border-gray-200 dark:border-gray-600">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={useHistoricalMode}
                        onChange={(e) => setUseHistoricalMode(e.target.checked)}
                        className="mr-2"
                        disabled={isAnalyzing}
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Use as historical analysis
                      </span>
                      {routeMetadata.start_time && (
                        <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">
                          (GPX from {format(new Date(routeMetadata.start_time), 'MMM d, yyyy')})
                        </span>
                      )}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-5">
                      {useHistoricalMode 
                        ? "Uses actual GPX timestamps for historical wind data analysis"
                        : "Adjusts GPX timing to your selected departure time for future prediction"
                      }
                    </p>
                    {useHistoricalMode && routeMetadata.start_time && (
                      (() => {
                        const gpxDate = new Date(routeMetadata.start_time);
                        const now = new Date();
                        
                        // Only check if date is in the future
                        const isPastDate = gpxDate < now;
                        
                        if (!isPastDate) {
                          return (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 ml-5 font-medium">
                              ⚠️ {format(gpxDate, 'MMM d, yyyy')} is in the future - use future prediction mode instead
                            </p>
                          );
                        } else {
                          return (
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1 ml-5 font-medium">
                              ✓ Using historical data for {format(gpxDate, 'MMM d, yyyy')}
                            </p>
                          );
                        }
                      })()
                    )}
                  </div>
                )}
              </div>
            )}
            
            <label className="flex items-center">
              <input
                type="radio"
                name="timing-mode"
                value="estimated"
                checked={timingMode === 'estimated'}
                onChange={(e) => setTimingMode(e.target.value as any)}
                className="mr-2"
                disabled={isAnalyzing}
              />
              <ClockIcon className="h-4 w-4 mr-1" />
              <span className="text-sm text-gray-800 dark:text-gray-200">Estimated duration</span>
            </label>
          </div>
        </div>

        {/* Departure Time */}
        <div>
          <label htmlFor="depart-time" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {timingMode === 'gpx_timestamps' ? 'Adjusted Departure Time' : 'Departure Time'}
          </label>
          <div className="relative">
            <input
              type="datetime-local"
              id="depart-time"
              value={departTime}
              onChange={(e) => setDepartTime(e.target.value)}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              disabled={isAnalyzing}
            />
          </div>
          {timingMode === 'gpx_timestamps' && routeMetadata?.start_time && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Original GPX start: {format(new Date(routeMetadata.start_time), 'PPpp')}
            </p>
          )}
        </div>

        {/* Estimated Duration (only show when in estimated mode) */}
        {timingMode === 'estimated' && (
          <div>
            <label htmlFor="estimated-duration" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estimated Duration (hours)
            </label>
            <input
              type="number"
              id="estimated-duration"
              value={estimatedDuration}
              onChange={(e) => setEstimatedDuration(parseFloat(e.target.value) || 0)}
              min="0.1"
              max="24"
              step="0.1"
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              disabled={isAnalyzing}
            />
            {routeMetadata?.total_distance_km && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Average speed: {Math.round((routeMetadata.total_distance_km / estimatedDuration) * 10) / 10} km/h
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="provider" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Weather Provider
          </label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            disabled={isAnalyzing}
          >
            <option value="open-meteo">Open-Meteo (Free)</option>
          </select>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? (
            <>
              <ArrowPathIcon className="animate-spin -ml-1 mr-2 h-4 w-4" />
              Analyzing...
            </>
          ) : (
            <>
              <PlayIcon className="-ml-1 mr-2 h-4 w-4" />
              Analyze Wind
            </>
          )}
        </button>
      </div>

      {progress && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {progress.stage?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
            </span>
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {Math.max(0, Math.min(100, Math.round(progress.progress * 100)))}%
            </span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-800/50 rounded-full h-2">
            <div
              className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, Math.round(progress.progress * 100)))}%` }}
            />
          </div>
          {progress.message && (
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">{progress.message}</p>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500 dark:text-gray-400">
        <p>Route ID: {routeId}</p>
        <p>Departure: {format(new Date(departTime), 'PPpp')}</p>
      </div>
    </div>
  )
}
