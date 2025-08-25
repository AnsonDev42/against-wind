'use client'

import { useState } from 'react'
import { CalendarIcon, PlayIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'

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

  const handleAnalyze = async () => {
    onAnalysisStart()
    setProgress(null)

    try {
      const departISO = new Date(departTime).toISOString()
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/analyze?route_id=${routeId}&depart=${departISO}&provider=${provider}`
      
      const eventSource = new EventSource(url)


      eventSource.addEventListener('progress', (event: MessageEvent) => {
        const data = JSON.parse(event.data)
        setProgress(data)
      })

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        const data = JSON.parse(event.data)
        onAnalysisComplete(data)
        eventSource.close()
      })

      eventSource.addEventListener('error', (event: MessageEvent) => {
        const data = JSON.parse(event.data)
        onAnalysisError(data.message || 'Analysis failed')
        eventSource.close()
      })

      eventSource.onerror = () => {
        onAnalysisError('Connection error')
        eventSource.close()
      }

    } catch (err) {
      onAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Wind Analysis</h3>
        <button
          onClick={onReset}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Upload new route
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="depart-time" className="block text-sm font-medium text-gray-700 mb-1">
            Departure Time
          </label>
          <div className="relative">
            <input
              type="datetime-local"
              id="depart-time"
              value={departTime}
              onChange={(e) => setDepartTime(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              disabled={isAnalyzing}
            />
            <CalendarIcon className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <label htmlFor="provider" className="block text-sm font-medium text-gray-700 mb-1">
            Weather Provider
          </label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
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
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-900">
              {progress.stage?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
            </span>
            <span className="text-sm text-blue-700">
              {Math.round(progress.progress * 100)}%
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.progress * 100}%` }}
            />
          </div>
          {progress.message && (
            <p className="text-xs text-blue-700 mt-2">{progress.message}</p>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500">
        <p>Route ID: {routeId}</p>
        <p>Departure: {format(new Date(departTime), 'PPpp')}</p>
      </div>
    </div>
  )
}
