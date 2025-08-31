'use client'

import { useState } from 'react'
import { PlayIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { useRouteMetadata } from '@/lib/hooks/useRouteMetadata'
import { useAnalysis } from '@/lib/hooks/useAnalysis'
import { TimingModeSelector } from './TimingModeSelector'
import { AnalysisProgressDisplay } from './AnalysisProgressDisplay'

interface AnalysisPanelProps {
  routeId: string
  onAnalysisStart: () => void
  onAnalysisComplete: (data: any) => void
  onAnalysisError: (error: string) => void
  onReset: () => void
}

export function AnalysisPanel({ 
  routeId, 
  onAnalysisStart,
  onAnalysisComplete, 
  onAnalysisError, 
  onReset 
}: AnalysisPanelProps) {
  const [provider, setProvider] = useState('open-meteo')

  const {
    routeMetadata,
    timingMode,
    setTimingMode,
    departTime,
    setDepartTime,
    useHistoricalMode,
    setUseHistoricalMode,
    estimatedDuration,
    setEstimatedDuration,
  } = useRouteMetadata(routeId)

  const { isAnalyzing, progress, handleAnalyze } = useAnalysis({
    onAnalysisStart,
    onAnalysisComplete,
    onAnalysisError,
  })

  const triggerAnalysis = () => {
    handleAnalyze({
      routeId,
      departTime,
      provider,
      timingMode,
      useHistoricalMode,
      estimatedDuration,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Wind Analysis</h3>
        <Button onClick={onReset} variant="secondary">
          Upload new route
        </Button>
      </div>

      <div className="space-y-4">
        <TimingModeSelector
          timingMode={timingMode}
          setTimingMode={setTimingMode}
          useHistoricalMode={useHistoricalMode}
          setUseHistoricalMode={setUseHistoricalMode}
          routeMetadata={routeMetadata}
          isAnalyzing={isAnalyzing}
        />

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
          onClick={triggerAnalysis}
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

      <AnalysisProgressDisplay progress={progress} />

      <div className="text-xs text-gray-500 dark:text-gray-400">
        <p>Route ID: {routeId}</p>
        <p>Departure: {format(new Date(departTime), 'PPpp')}</p>
      </div>
    </div>
  )
}
