'use client'

import { useState } from 'react'
import { AnalysisProgress, TimingMode } from '@/lib/types/analysis'

interface UseAnalysisProps {
  onAnalysisStart: () => void
  onAnalysisComplete: (data: any) => void
  onAnalysisError: (error: string) => void
}

interface PerformAnalysisParams {
  routeId: string
  departTime: string
  provider: string
  timingMode: TimingMode
  useHistoricalMode: boolean
  estimatedDuration: number
}

export function useAnalysis({ onAnalysisStart, onAnalysisComplete, onAnalysisError }: UseAnalysisProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState<AnalysisProgress | null>(null)

  const handleAnalyze = async ({ 
    routeId, 
    departTime, 
    provider, 
    timingMode, 
    useHistoricalMode, 
    estimatedDuration 
  }: PerformAnalysisParams) => {
    onAnalysisStart()
    setIsAnalyzing(true)
    setProgress(null)

    try {
      const departISO = new Date(departTime).toISOString()
      
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

      eventSource.onopen = () => {
        setIsAnalyzing(true)
      }

      eventSource.addEventListener('progress', (event: MessageEvent) => {
        const data = JSON.parse(event.data)
        setProgress(data)
      })

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        const data = JSON.parse(event.data)
        onAnalysisComplete(data)
        setProgress(null)
        setIsAnalyzing(false)
        eventSource.close()
      })

      eventSource.addEventListener('error', (event: MessageEvent) => {
        try {
          const raw = (event as any)?.data
          if (typeof raw !== 'string') return
          const data = JSON.parse(raw)
          onAnalysisError(data.message || 'Analysis failed')
        } catch {
          onAnalysisError('Analysis failed with an unknown error.')
        } finally {
          setProgress(null)
          setIsAnalyzing(false)
          eventSource.close()
        }
      })

      eventSource.onerror = () => {
        onAnalysisError('Connection error to analysis service.')
        setProgress(null)
        setIsAnalyzing(false)
        eventSource.close()
      }

    } catch (err) { 
      onAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
      setIsAnalyzing(false)
    }
  }

  return { isAnalyzing, progress, handleAnalyze }
}
