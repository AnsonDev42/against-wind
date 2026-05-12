import React from 'react';

interface MapOverlayProps {
  isAnalyzing: boolean;
  routeId: string | null;
}

const Overlay = ({ children }: { children: React.ReactNode }) => (
  <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
    <div className="text-center">{children}</div>
  </div>
);

export function MapOverlay({ isAnalyzing, routeId }: MapOverlayProps) {
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
