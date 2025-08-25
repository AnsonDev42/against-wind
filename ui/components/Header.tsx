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
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('toggle-settings'))}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <ThemeToggle />
            <HealthCheckIndicator status={healthStatus} />
          </div>
        </div>
      </div>
    </header>
  )
}
