'use client'

import { WindImpactMetrics, WindSectionInsight } from '@/lib/analysisMetrics'

interface WindActionPlanProps {
  windImpact: WindImpactMetrics
  timing?: {
    wind_duration_delta_s?: number
    wind_duration_delta_pct?: number
  }
}

const formatMinutes = (seconds?: number) => {
  if (!Number.isFinite(seconds)) return null

  const minutes = Math.abs(seconds || 0) / 60

  return minutes < 1 ? '<1 min' : `${Math.round(minutes)} min`
}

const formatKmRange = (section: WindSectionInsight) => {
  if (section.lengthKm <= 1) {
    return `around km ${Math.round(section.startKm)}`
  }

  return `km ${Math.round(section.startKm)}-${Math.round(section.endKm)}`
}

const formatPercent = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}%`

const formatComponent = (value: number) => {
  const label = value >= 0 ? 'headwind' : 'tailwind'

  return `${Math.abs(value).toFixed(1)} m/s ${label}`
}

const buildRideCall = (windImpact: WindImpactMetrics, timing?: WindActionPlanProps['timing']) => {
  const deltaSeconds = timing?.wind_duration_delta_s
  const deltaPct = timing?.wind_duration_delta_pct
  const load = windImpact.avgAeroLoadDeltaPct

  if ((deltaPct || 0) >= 10 || load >= 120) {
    return {
      title: 'Harder than calm air',
      detail: deltaSeconds
        ? `Expect roughly ${formatMinutes(deltaSeconds)} slower than a no-wind ride.`
        : `Average aero load is ${formatPercent(load)} versus calm air.`,
      tone: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100',
    }
  }

  if ((deltaPct || 0) <= -5 || load <= -10) {
    return {
      title: 'Wind should help overall',
      detail: deltaSeconds
        ? `Expect roughly ${formatMinutes(deltaSeconds)} faster than a no-wind ride.`
        : `Average aero load is ${formatPercent(load)} versus calm air.`,
      tone: 'border-green-200 bg-green-50 text-green-950 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-100',
    }
  }

  return {
    title: 'Manageable wind',
    detail: deltaSeconds
      ? `Wind changes the ETA by about ${formatMinutes(deltaSeconds)} versus no wind.`
      : `Average aero load is ${formatPercent(load)} versus calm air.`,
    tone: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100',
  }
}

const buildActions = (windImpact: WindImpactMetrics, timing?: WindActionPlanProps['timing']) => {
  const actions: string[] = []
  const hardSection = windImpact.hardestSection
  const reliefSection = windImpact.reliefSection
  const penaltyPct = timing?.wind_duration_delta_pct || 0

  if (penaltyPct >= 8) {
    actions.push('If timing is flexible, change the departure time and rerun before committing.')
  }

  if (hardSection) {
    actions.push(`Do not chase average speed through ${formatKmRange(hardSection)}; budget effort there.`)
  }

  if (reliefSection) {
    actions.push(`Use ${formatKmRange(reliefSection)} to recover or make back time.`)
  }

  if (windImpact.avgHeadwindComponentMs >= 1) {
    actions.push('Prioritize aero position or drafting where traffic and route conditions allow.')
  }

  return actions.slice(0, 3)
}

const SectionDetail = ({
  title,
  section,
}: {
  title: string
  section: WindSectionInsight
}) => (
  <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
          {formatKmRange(section)} · {section.lengthKm.toFixed(0)} km · {section.dominantWindClass}wind
        </p>
      </div>
      <div className="text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
        {formatPercent(section.avgAeroLoadDeltaPct)}
      </div>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
      <span>{formatComponent(section.avgHeadwindComponentMs)}</span>
      <span className="text-right">peak {formatPercent(section.peakAeroLoadDeltaPct)}</span>
    </div>
  </div>
)

export function WindActionPlan({ windImpact, timing }: WindActionPlanProps) {
  const rideCall = buildRideCall(windImpact, timing)
  const actions = buildActions(windImpact, timing)

  return (
    <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-700">
      <h3 className="font-medium text-gray-900 dark:text-gray-100">Action Plan</h3>

      <div className={`mt-3 rounded-md border p-3 ${rideCall.tone}`}>
        <div className="text-sm font-semibold">{rideCall.title}</div>
        <div className="mt-1 text-sm">{rideCall.detail}</div>
      </div>

      {actions.length > 0 && (
        <div className="mt-3 space-y-2">
          {actions.map(action => (
            <div key={action} className="text-sm leading-snug text-gray-800 dark:text-gray-100">
              {action}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {windImpact.hardestSection && (
          <SectionDetail title="Hardest wind block" section={windImpact.hardestSection} />
        )}
        {windImpact.reliefSection && (
          <SectionDetail title="Best recovery block" section={windImpact.reliefSection} />
        )}
      </div>
    </div>
  )
}
