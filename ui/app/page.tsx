'use client'

import { useState, useEffect } from 'react'
import { UploadForm } from '@/components/UploadForm'
import { RouteMap } from '@/components/RouteMap'
import { AnalysisPanel } from '@/components/AnalysisPanel'
import { Header } from '@/components/Header'
import { loadDemoRoute, loadCachedAnalysisResults, cacheAnalysisResults, DEMO_ROUTE_CONFIG } from '@/lib/demo'

export default function Home() {
  const [routeId, setRouteId] = useState<string | null>(null)
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [isLoadingDemo, setIsLoadingDemo] = useState(true)

  const handleRouteUploaded = (newRouteId: string) => {
    setRouteId(newRouteId)
    setAnalysisData(null)
  }

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

  const handleAnalysisError = (error: string) => {
    console.error('Analysis error:', error)
    setIsAnalyzing(false)
  }

  // Auto-load demo route on page load
  useEffect(() => {
    async function initializeDemo() {
      try {
        const demoRouteId = await loadDemoRoute()
        if (demoRouteId) {
          setRouteId(demoRouteId)
          setIsDemoMode(true)
          
          // Try to load cached analysis results
          const cachedResults = await loadCachedAnalysisResults(demoRouteId)
          if (cachedResults) {
            setAnalysisData(cachedResults)
          }
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
        
        const cachedResults = await loadCachedAnalysisResults(demoRouteId)
        if (cachedResults) {
          setAnalysisData(cachedResults)
        } else {
          setAnalysisData(null)
        }
      }
    } catch (error) {
      console.error('Failed to reset to demo:', error)
    } finally {
      setIsLoadingDemo(false)
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <Header />
      
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left Panel */}
        <div className="w-96 bg-white shadow-lg flex flex-col">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Route Analysis
              </h2>
              {isDemoMode && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Demo
                </span>
              )}
            </div>
            {isDemoMode && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700">
                  <strong>{DEMO_ROUTE_CONFIG.name}</strong><br/>
                  {DEMO_ROUTE_CONFIG.description}
                </p>
              </div>
            )}
            
            {isLoadingDemo ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100">
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-blue-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                  <button
                    onClick={handleResetToDemo}
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    Or try the demo route
                  </button>
                </div>
              </div>
            ) : (
              <AnalysisPanel
                routeId={routeId}
                isAnalyzing={isAnalyzing}
                analysisData={analysisData}
                onAnalysisStart={handleAnalysisStart}
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
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2">Wind Summary</h3>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {Math.round(analysisData.summary?.head_pct || 0)}%
                      </div>
                      <div className="text-gray-600">Headwind</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-600">
                        {Math.round(analysisData.summary?.cross_pct || 0)}%
                      </div>
                      <div className="text-gray-600">Crosswind</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(analysisData.summary?.tail_pct || 0)}%
                      </div>
                      <div className="text-gray-600">Tailwind</div>
                    </div>
                  </div>
                </div>
                
                {analysisData.summary?.longest_head_km > 0 && (
                  <div className="bg-red-50 rounded-lg p-4">
                    <h4 className="font-medium text-red-900 mb-1">
                      Longest Headwind Section
                    </h4>
                    <p className="text-red-700">
                      {analysisData.summary.longest_head_km.toFixed(1)} km
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 min-h-0">
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
