'use client'

import { ClockIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { RouteMetadata, TimingMode } from '@/lib/types/analysis'

interface TimingModeSelectorProps {
  timingMode: TimingMode
  setTimingMode: (mode: TimingMode) => void
  useHistoricalMode: boolean
  setUseHistoricalMode: (use: boolean) => void
  routeMetadata: RouteMetadata | null
  isAnalyzing: boolean
}

export function TimingModeSelector({ 
  timingMode, 
  setTimingMode, 
  useHistoricalMode, 
  setUseHistoricalMode, 
  routeMetadata, 
  isAnalyzing 
}: TimingModeSelectorProps) {
  return (
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
            onChange={(e) => setTimingMode(e.target.value as TimingMode)}
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
                onChange={(e) => setTimingMode(e.target.value as TimingMode)}
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
            onChange={(e) => setTimingMode(e.target.value as TimingMode)}
            className="mr-2"
            disabled={isAnalyzing}
          />
          <ClockIcon className="h-4 w-4 mr-1" />
          <span className="text-sm text-gray-800 dark:text-gray-200">Estimated duration</span>
        </label>
      </div>
    </div>
  )
}
