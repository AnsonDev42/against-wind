import React from 'react';

interface TooltipInfo {
  x: number;
  y: number;
  data: any;
}

interface WindSegmentTooltipProps {
  tooltipInfo: TooltipInfo | null;
  onClose: () => void;
}

const getWindClassColor = (windClass: string) => {
  switch (windClass) {
    case 'head':
      return 'text-red-600 dark:text-red-400';
    case 'tail':
      return 'text-green-600 dark:text-green-400';
    case 'cross':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-gray-600 dark:text-gray-300';
  }
};

export function WindSegmentTooltip({ tooltipInfo, onClose }: WindSegmentTooltipProps) {
  if (!tooltipInfo) {
    return null;
  }

  const { x, y, data } = tooltipInfo;

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: x + 10,
        top: y - 10,
        transform: 'translateY(-100%)',
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 p-3 min-w-[200px] relative">
        <button
          className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 pointer-events-auto"
          onClick={onClose}
        >
          ×
        </button>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 pr-6">Wind Details</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Type:</span>
            <span className={`font-medium capitalize ${getWindClassColor(data.windClass)}`}>
              {data.windClass}wind
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Speed:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{data.windSpeed?.toFixed(1)} m/s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Direction:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{data.windDirection?.toFixed(0)}°</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Yaw Angle:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{data.yawAngle?.toFixed(0)}°</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Confidence:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{(data.confidence * 100)?.toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Segment:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">#{data.seq}</span>
          </div>
        </div>

        <div className="absolute top-full left-1/2 transform -translate-x-1/2">
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white dark:border-t-gray-800"></div>
          <div className="w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-l-transparent border-r-transparent border-t-gray-300 dark:border-t-gray-600 absolute top-[-7px] left-1/2 transform -translate-x-1/2 -z-10"></div>
        </div>
      </div>
    </div>
  );
}
