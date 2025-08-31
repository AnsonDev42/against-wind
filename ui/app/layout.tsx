import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProviders } from '@/components/ThemeProviders'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Against Wind - Cycling Route Wind Analysis',
  description: 'Analyze wind conditions for your cycling routes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProviders>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
            {children}
          </div>
        </ThemeProviders>
      </body>
    </html>
  )
}
