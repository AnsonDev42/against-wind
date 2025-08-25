'use client';

import React from 'react';

export type HealthStatus = 'healthy' | 'unhealthy' | 'pending';

interface HealthCheckIndicatorProps {
  status: HealthStatus;
}

const HealthCheckIndicator: React.FC<HealthCheckIndicatorProps> = ({ status }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'unhealthy':
        return 'bg-red-500';
      case 'pending':
      default:
        return 'bg-yellow-500';
    }
  };

  const getStatusTooltip = () => {
    switch (status) {
      case 'healthy':
        return 'API Status: Healthy';
      case 'unhealthy':
        return 'API Status: Unhealthy';
      case 'pending':
      default:
        return 'API Status: Checking...';
    }
  };

  return (
    <div className="relative flex items-center group">
      <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-700 dark:bg-gray-600 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        {getStatusTooltip()}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-700 dark:border-t-gray-600"></div>
      </div>
    </div>
  );
};

export default HealthCheckIndicator;
