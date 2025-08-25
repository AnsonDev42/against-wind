'use client'

import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline'
import { useTheme } from '../lib/hooks/useTheme'
import { Theme } from '../lib/types/theme'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const getNextTheme = (currentTheme: Theme): Theme => {
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
    switch (theme) {
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
    switch (theme) {
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
    const nextTheme = getNextTheme(theme)
    setTheme(nextTheme)
  }

  return (
    <button
      onClick={handleToggle}
      className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      title={`Current: ${getCurrentLabel()}. Click to cycle themes.`}
    >
      {getCurrentIcon()}
      <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-300">
        {getCurrentLabel()}
      </span>
    </button>
  )
}
