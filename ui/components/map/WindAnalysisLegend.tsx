import React from 'react';

interface WindAnalysisLegendProps {
  analysisData: any;
}

export function WindAnalysisLegend({ analysisData }: WindAnalysisLegendProps) {
  if (!analysisData) {
    return null;
  }

  const { summary } = analysisData;

  return (
    <div className="absolute bottom-4 left-4 rounded-lg p-4 max-w-xs bg-gray-50 dark:bg-gray-700">
      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Wind Analysis</h4>
      <div className="space-y-2 text-sm mb-3 text-gray-700 dark:text-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-red-600 mr-2"></div>
            <span className="text-gray-600 dark:text-gray-300">Headwind</span>
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(summary?.head_pct || 0)}%</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-amber-600 mr-2"></div>
            <span className="text-gray-600 dark:text-gray-300">Crosswind</span>
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(summary?.cross_pct || 0)}%</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-green-600 mr-2"></div>
            <span className="text-gray-600 dark:text-gray-300">Tailwind</span>
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(summary?.tail_pct || 0)}%</span>
        </div>
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-600 pt-2">
        <p>Circle size = wind speed</p>
        <p>Click segments for details</p>
      </div>
    </div>
  );
}
