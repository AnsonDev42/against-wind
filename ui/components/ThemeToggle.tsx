'use client'

import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Debug logging
  useEffect(() => {
    if (mounted) {
      console.log('Theme debug:', { theme, resolvedTheme })
      console.log('HTML classes:', document.documentElement.className)
    }
  }, [mounted, theme, resolvedTheme])

  const getNextTheme = (currentTheme?: string): 'light' | 'dark' | 'system' => {
    switch (currentTheme) {
      case 'light':
        return 'dark'
      case 'dark':
        return 'system'
      case 'system':
        return 'light'
      default:
        return 'light'
    }
  }

  const getCurrentIcon = () => {
    // Use resolvedTheme for icon (actual applied theme)
    const t = resolvedTheme || theme
    switch (t) {
      case 'light':
        return <SunIcon className="h-5 w-5" />
      case 'dark':
        return <MoonIcon className="h-5 w-5" />
      case 'system':
        return <ComputerDesktopIcon className="h-5 w-5" />
      default:
        return <SunIcon className="h-5 w-5" />
    }
  }

  const getCurrentLabel = () => {
    switch (theme) { // keep label reflecting the configured mode
      case 'light':
        return 'Light'
      case 'dark':
        return 'Dark'
      case 'system':
        return 'System'
      default:
        return 'Light'
    }
  }

  const handleToggle = () => {
    const nextTheme = getNextTheme(theme || resolvedTheme)
    setTheme(nextTheme)
  }

  // Avoid hydration mismatch before mounted (next-themes needs client)
  if (!mounted) {
    return (
      <button className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 transition-colors" aria-label="Toggle theme" disabled>
        <SunIcon className="h-5 w-5" />
        <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-300">Theme</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      aria-label={`Current: ${getCurrentLabel()}. Click to cycle themes.`}
    >
      {getCurrentIcon()}
      <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-300">
        {getCurrentLabel()}
      </span>
    </button>
  )
}
