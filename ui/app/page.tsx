'use client'

import { useState } from 'react'
import { UploadForm } from '@/components/UploadForm'
import { RouteMap } from '@/components/RouteMap'
import { AnalysisPanel } from '@/components/AnalysisPanel'
import { Header } from '@/components/Header'

export default function Home() {
  const [routeId, setRouteId] = useState<string | null>(null)
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

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
  }

  const handleAnalysisError = (error: string) => {
    console.error('Analysis error:', error)
    setIsAnalyzing(false)
  }

  return (
    <div className="flex flex-col h-screen">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-96 bg-white shadow-lg flex flex-col">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Route Analysis
            </h2>
            
            {!routeId ? (
              <UploadForm onRouteUploaded={handleRouteUploaded} />
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
        <div className="flex-1">
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
