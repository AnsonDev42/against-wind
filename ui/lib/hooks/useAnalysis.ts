'use client'

import { useState } from 'react'
import { AnalysisProgress, TimingMode } from '@/lib/types/analysis'

interface UseAnalysisProps {
  onAnalysisStart: () => void
  onAnalysisPartial: (data: any) => void
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
  ftpWattsPerKg: number
  riderWeightKg: number
  bikeWeightKg: number
  sampleDistanceKm: number
}

export function useAnalysis({ onAnalysisStart, onAnalysisPartial, onAnalysisComplete, onAnalysisError }: UseAnalysisProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState<AnalysisProgress | null>(null)

  const handleAnalyze = async ({ 
    routeId, 
    departTime, 
    provider, 
    timingMode, 
    useHistoricalMode, 
    estimatedDuration,
    ftpWattsPerKg,
    riderWeightKg,
    bikeWeightKg,
    sampleDistanceKm,
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
        sample_distance_km: sampleDistanceKm.toString(),
        timing_mode: timingMode,
        use_historical_mode: (useHistoricalMode && timingMode === 'gpx_timestamps').toString(),
      })
      
      if (timingMode === 'manual_duration') {
        params.append('estimated_duration_hours', estimatedDuration.toString())
      }

      if (timingMode === 'power') {
        params.append('ftp_w_per_kg', ftpWattsPerKg.toString())
        params.append('rider_weight_kg', riderWeightKg.toString())
        params.append('bike_weight_kg', bikeWeightKg.toString())
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

      eventSource.addEventListener('partial', (event: MessageEvent) => {
        const data = JSON.parse(event.data)
        onAnalysisPartial(data)
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
