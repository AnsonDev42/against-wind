// Demo route utilities for auto-loading a sample GPX file

export const DEMO_ROUTE_CONFIG = {
  name: "Glossop to Sheffield",
  description: "A 50km cycling route from Glossop to Sheffield through the Peak District",
  departTime: "2024-12-15T10:00:00", // Fixed demo time for consistent results
  provider: "open_meteo"
}

export async function loadDemoRoute(): Promise<string | null> {
  try {
    // Always return the static demo route ID for consistency
    const demoRouteId = 'demo-glossop-sheffield'
    
    // Cache the route ID for consistency with other functions
    localStorage.setItem('demo-route-id', demoRouteId)
    
    return demoRouteId
  } catch (error) {
    console.error('Failed to load demo route:', error)
    return null
  }
}

export async function loadCachedAnalysisResults(routeId: string) {
  try {
    // For demo route, load pre-cached results from static file
    if (routeId === 'demo-glossop-sheffield') {
      const response = await fetch('/demo-cache.json')
      if (response.ok) {
        const demoResults = await response.json()
        // Also cache in localStorage for consistency
        localStorage.setItem('demo-analysis-results', JSON.stringify(demoResults))
        return demoResults
      }
    }
    
    // Fallback to localStorage for other routes
    const cached = localStorage.getItem('demo-analysis-results')
    if (cached) {
      const parsedResults = JSON.parse(cached)
      // Check if cached results are for the current route
      if (parsedResults.result?.route_id === routeId) {
        return parsedResults
      }
    }
  } catch (error) {
    console.error('Failed to load cached analysis results:', error)
  }
  return null
}

export function cacheAnalysisResults(results: any) {
  try {
    localStorage.setItem('demo-analysis-results', JSON.stringify(results))
  } catch (error) {
    console.error('Failed to cache analysis results:', error)
  }
}
