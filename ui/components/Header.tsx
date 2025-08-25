'use client'

import { SunIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import HealthCheckIndicator, { HealthStatus } from './HealthCheckIndicator'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('pending')

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
        if (response.ok) {
          const data = await response.json()
          if (data.status === 'healthy') {
            setHealthStatus('healthy')
          } else {
            setHealthStatus('unhealthy')
          }
        } else {
          setHealthStatus('unhealthy')
        }
      } catch (error) {
        console.error('Health check failed:', error)
        setHealthStatus('unhealthy')
      }
    }

    checkHealth() // Initial check
    const intervalId = setInterval(checkHealth, 3 * 60 * 1000) // Check every 3 minutes

    return () => clearInterval(intervalId) // Cleanup on unmount
  }, [])

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <SunIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Against Wind</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Cycling route wind analysis
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <HealthCheckIndicator status={healthStatus} />
          </div>
        </div>
      </div>
    </header>
  )
}
