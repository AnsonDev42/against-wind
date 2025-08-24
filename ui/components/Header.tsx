'use client'

import { SunIcon } from '@heroicons/react/24/outline'

export function Header() {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="px-6 py-4">
        <div className="flex items-center">
          <SunIcon className="h-8 w-8 text-blue-600 mr-3" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Against Wind</h1>
            <p className="text-sm text-gray-600">Cycling route wind analysis</p>
          </div>
        </div>
      </div>
    </header>
  )
}
