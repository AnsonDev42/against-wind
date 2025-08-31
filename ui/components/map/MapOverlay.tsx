import React from 'react';

interface MapOverlayProps {
  isAnalyzing: boolean;
  routeId: string | null;
  isMapboxTokenSet: boolean;
}

const Overlay = ({ children }: { children: React.ReactNode }) => (
  <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
    <div className="text-center">{children}</div>
  </div>
);

export function MapOverlay({ isAnalyzing, routeId, isMapboxTokenSet }: MapOverlayProps) {
  if (!isMapboxTokenSet) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-gray-600 mb-2">Map requires Mapbox token</p>
          <p className="text-sm text-gray-500">Set NEXT_PUBLIC_MAPBOX_TOKEN environment variable</p>
        </div>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <Overlay>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Analyzing wind conditions...</p>
      </Overlay>
    );
  }

  if (!routeId) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-lg mb-2">Upload a GPX file to get started</p>
          <p className="text-sm">Analyze wind conditions for your cycling route</p>
        </div>
      </div>
    );
  }

  return null;
}
