'use client'

import { AnalysisProgress } from '@/lib/types/analysis'

interface AnalysisProgressDisplayProps {
  progress: AnalysisProgress | null
}

export function AnalysisProgressDisplay({ progress }: AnalysisProgressDisplayProps) {
  if (!progress) return null

  const formattedStage = progress.stage
    ?.replace(/_/g, ' ')
    .replace(/\b\w/g, (l: string) => l.toUpperCase())

  const progressPercentage = Math.max(0, Math.min(100, Math.round(progress.progress * 100)))

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
          {formattedStage}
        </span>
        <span className="text-sm text-blue-700 dark:text-blue-300">
          {progressPercentage}%
        </span>
      </div>
      <div className="w-full bg-blue-200 dark:bg-blue-800/50 rounded-full h-2">
        <div
          className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      {progress.message && (
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">{progress.message}</p>
      )}
    </div>
  )
}
