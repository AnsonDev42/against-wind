'use client'

import { useState, useEffect } from 'react'
import { UploadForm } from '@/components/upload/UploadForm'
import { RouteMap } from '@/components/map/RouteMap'
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel'
import { Header } from '@/components/Header'
import { loadDemoRoute, cacheAnalysisResults, DEMO_ROUTE_CONFIG } from '@/lib/demo'
import { Button } from "@/components/ui/button"
import { calculateWindImpactMetrics, WIND_REFERENCE_SPEED_KMH } from '@/lib/analysisMetrics'
import { WindActionPlan } from '@/components/analysis/WindActionPlan'

const formatWindSpeed = (speedMs: number) => `${(speedMs * 3.6).toFixed(1)} km/h`

const formatSignedPercent = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}%`

const formatHeadwindComponent = (componentMs: number) => {
  const label = componentMs >= 0 ? 'headwind' : 'tailwind'

  return `${Math.abs(componentMs).toFixed(1)} m/s ${label}`
}

const formatTimingDelta = (seconds?: number) => {
  if (!Number.isFinite(seconds)) return null

  const absoluteMinutes = Math.abs(seconds || 0) / 60
  const roundedMinutes = absoluteMinutes < 1 ? '<1' : Math.round(absoluteMinutes).toString()
  const verb = (seconds || 0) >= 0 ? 'adds' : 'saves'

  return `Wind ${verb} ${roundedMinutes} min vs no wind`
}

export default function Home() {
  const [routeId, setRouteId] = useState<string | null>(null)
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [isLoadingDemo, setIsLoadingDemo] = useState(true)

  // const handleRouteUploaded = (newRouteId: string) => {
  //   setRouteId(newRouteId)
  //   setAnalysisData(null)
  // }

  const handleAnalysisStart = () => {
    setIsAnalyzing(true)
    setAnalysisData(null)
  }

  const handleAnalysisComplete = (data: any) => {
    setAnalysisData(data)
    setIsAnalyzing(false)

    // Cache results if in demo mode
    if (isDemoMode) {
      cacheAnalysisResults(data)
    }
  }

  const handleAnalysisPartial = (data: any) => {
    setIsAnalyzing(true)
    setAnalysisData((previous: any) => {
      const segmentsBySeq = new Map<number, any>()

      for (const segment of previous?.segments || []) {
        segmentsBySeq.set(segment.seq, segment)
      }
      for (const segment of data.segments || []) {
        segmentsBySeq.set(segment.seq, segment)
      }

      return {
        ...previous,
        is_partial: true,
        processed: data.processed,
        total: data.total,
        segments: Array.from(segmentsBySeq.values()).sort((a, b) => a.seq - b.seq),
        summary: data.summary || previous?.summary,
      }
    })
  }

  const handleAnalysisError = (error: string) => {
    console.error('Analysis error:', error)
    setIsAnalyzing(false)
    setAnalysisData(null)
  }

  // Auto-load demo route on page load
  useEffect(() => {
    async function initializeDemo() {
      try {
        // Wait 3.5 seconds before loading demo
        await new Promise(resolve => setTimeout(resolve, 3500))

        const demoRouteId = await loadDemoRoute()
        if (demoRouteId) {
          setRouteId(demoRouteId)
          setIsDemoMode(true)

          // Don't load cached analysis results - let user click "Analyze Wind"
        }
      } catch (error) {
        console.error('Failed to initialize demo:', error)
      } finally {
        setIsLoadingDemo(false)
      }
    }

    initializeDemo()
  }, [])

  const handleNewRoute = (newRouteId: string) => {
    setRouteId(newRouteId)
    setAnalysisData(null)
    setIsDemoMode(false)
  }

  const handleResetToDemo = async () => {
    setIsLoadingDemo(true)
    try {
      const demoRouteId = await loadDemoRoute()
      if (demoRouteId) {
        setRouteId(demoRouteId)
        setIsDemoMode(true)
        setAnalysisData(null)
        // Don't load cached analysis results - let user click "Analyze Wind"
      }
    } catch (error) {
      console.error('Failed to reset to demo:', error)
    } finally {
      setIsLoadingDemo(false)
    }
  }

  const windImpact = calculateWindImpactMetrics(analysisData?.segments)
  const timingDelta = formatTimingDelta(analysisData?.timing?.wind_duration_delta_s)
  const aeroLoadTone = (windImpact?.avgAeroLoadDeltaPct || 0) >= 0
    ? 'text-red-600 dark:text-red-400'
    : 'text-green-600 dark:text-green-400'

  return (
    <div className="flex flex-col min-h-screen lg:h-screen">
      <Header />

      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* Left Panel */}
        <div className="w-full bg-white dark:bg-gray-800 shadow-lg flex flex-col lg:w-96 lg:shrink-0">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Route Analysis
              </h2>
              {isDemoMode && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                  Demo
                </span>
              )}
            </div>
            {isDemoMode && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>{DEMO_ROUTE_CONFIG.name}</strong><br />
                  {DEMO_ROUTE_CONFIG.description}
                </p>
              </div>
            )}

            {isLoadingDemo ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30">
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-blue-700 dark:text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading demo route...
                </div>
              </div>
            ) : !routeId ? (
              <div className="space-y-4">
                <UploadForm onRouteUploaded={handleNewRoute} />
                <div className="text-center">
                  <Button
                    onClick={handleResetToDemo}
                    variant="secondary"
                  // className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                  >
                    Or try the demo route
                  </Button>
                </div>
              </div>
            ) : (
              <AnalysisPanel
                routeId={routeId}
                onAnalysisStart={handleAnalysisStart}
                onAnalysisPartial={handleAnalysisPartial}
                onAnalysisComplete={handleAnalysisComplete}
                onAnalysisError={handleAnalysisError}
                onReset={() => {
                  setRouteId(null)
                  setAnalysisData(null)
                  setIsAnalyzing(false)
                  setIsDemoMode(false)
                }}
              />
            )}
          </div>

          {/* Analysis Results */}
          {analysisData && (
            <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-800">
              <div className="space-y-4">
                {windImpact && (
                  <WindActionPlan windImpact={windImpact} timing={analysisData.timing} />
                )}

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Wind Summary</h3>
                  <div className="flex flex-col md:flex-row gap-3 md:gap-4 text-sm md:justify-between">
                    <div className="flex-1 min-w-0 text-center flex flex-col items-center">
                      <div className="text-lg md:text-2xl font-bold text-red-600 whitespace-nowrap leading-none">
                        {Math.round(analysisData.summary?.head_pct || 0)}%
                      </div>
                      <div className="text-gray-600 dark:text-gray-300 leading-tight">Headwind</div>
                    </div>
                    <div className="flex-1 min-w-0 text-center flex flex-col items-center">
                      <div className="text-lg md:text-2xl font-bold text-amber-600 whitespace-nowrap leading-none">
                        {Math.round(analysisData.summary?.cross_pct || 0)}%
                      </div>
                      <div className="text-gray-600 dark:text-gray-300 leading-tight">Crosswind</div>
                    </div>
                    <div className="flex-1 min-w-0 text-center flex flex-col items-center">
                      <div className="text-lg md:text-2xl font-bold text-green-600 whitespace-nowrap leading-none">
                        {Math.round(analysisData.summary?.tail_pct || 0)}%
                      </div>
                      <div className="text-gray-600 dark:text-gray-300 leading-tight">Tailwind</div>
                    </div>
                  </div>
                </div>

                {analysisData.summary?.longest_head_km > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                    <h4 className="font-medium text-red-900 dark:text-red-100 mb-1">
                      Longest Headwind Section
                    </h4>
                    <p className="text-red-700 dark:text-red-300">
                      {analysisData.summary.longest_head_km.toFixed(1)} km
                    </p>
                  </div>
                )}

                {windImpact && (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">Speed + Resistance</h3>
                      <span className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {WIND_REFERENCE_SPEED_KMH} km/h ref
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="text-lg font-bold leading-none text-gray-900 dark:text-gray-100">
                          {formatWindSpeed(windImpact.avgWindSpeedMs)}
                        </div>
                        <div className="mt-1 text-xs leading-tight text-gray-600 dark:text-gray-300">
                          Avg rider-height wind
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg font-bold leading-none text-gray-900 dark:text-gray-100">
                          {formatWindSpeed(windImpact.maxWindSpeedMs)}
                        </div>
                        <div className="mt-1 text-xs leading-tight text-gray-600 dark:text-gray-300">
                          Strongest segment
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg font-bold leading-none text-gray-900 dark:text-gray-100">
                          {formatHeadwindComponent(windImpact.avgHeadwindComponentMs)}
                        </div>
                        <div className="mt-1 text-xs leading-tight text-gray-600 dark:text-gray-300">
                          Net route component
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className={`text-lg font-bold leading-none ${aeroLoadTone}`}>
                          {formatSignedPercent(windImpact.avgAeroLoadDeltaPct)}
                        </div>
                        <div className="mt-1 text-xs leading-tight text-gray-600 dark:text-gray-300">
                          Aero load vs no wind
                        </div>
                      </div>
                    </div>
                    {timingDelta && (
                      <div className="mt-3 border-t border-gray-200 pt-3 text-sm font-medium text-gray-800 dark:border-gray-600 dark:text-gray-100">
                        {timingDelta}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="min-h-[420px] flex-1 lg:min-h-0">
          <RouteMap
            routeId={routeId}
            analysisData={analysisData}
            isAnalyzing={isAnalyzing}
          />
        </div>
      </div>
    </div>
  )
}
