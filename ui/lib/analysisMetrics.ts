export const WIND_REFERENCE_SPEED_KMH = 25
export const WIND_REFERENCE_SPEED_MS = WIND_REFERENCE_SPEED_KMH / 3.6

export interface SegmentWindLike {
  seq?: number | string | null
  wind_class?: string | null
  wind_ms1p5m?: number | string | null
  yaw_deg?: number | string | null
}

export interface WindVectorImpact {
  headwindComponentMs: number
  crosswindComponentMs: number
  apparentWindMs: number
  aeroLoadDeltaPct: number
}

export interface WindImpactMetrics {
  segmentCount: number
  avgWindSpeedMs: number
  maxWindSpeedMs: number
  avgHeadwindComponentMs: number
  avgAeroLoadDeltaPct: number
  hardestSection: WindSectionInsight | null
  reliefSection: WindSectionInsight | null
}

export interface WindSectionInsight {
  startKm: number
  endKm: number
  lengthKm: number
  avgWindSpeedMs: number
  avgHeadwindComponentMs: number
  avgAeroLoadDeltaPct: number
  peakAeroLoadDeltaPct: number
  dominantWindClass: string
}

interface SegmentImpact extends WindVectorImpact {
  seq: number
  windClass: string
  windSpeedMs: number
}

const toFiniteNumber = (value: number | string | null | undefined) => {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : null
}

export const calculateWindVectorImpact = (
  windSpeedMs: number,
  yawDeg: number,
  referenceSpeedMs = WIND_REFERENCE_SPEED_MS,
): WindVectorImpact => {
  const yawRad = (yawDeg * Math.PI) / 180
  const windAlongRouteMs = windSpeedMs * Math.cos(yawRad)
  const crosswindComponentMs = Math.abs(windSpeedMs * Math.sin(yawRad))
  const apparentWindMs = Math.hypot(referenceSpeedMs - windAlongRouteMs, crosswindComponentMs)
  const aeroLoadDeltaPct = ((apparentWindMs ** 2) / (referenceSpeedMs ** 2) - 1) * 100

  return {
    headwindComponentMs: -windAlongRouteMs,
    crosswindComponentMs,
    apparentWindMs,
    aeroLoadDeltaPct,
  }
}

export const calculateWindImpactMetrics = (
  segments: SegmentWindLike[] | null | undefined,
): WindImpactMetrics | null => {
  const impacts = (segments || [])
    .map(segment => {
      const seq = toFiniteNumber(segment.seq)
      const windSpeedMs = toFiniteNumber(segment.wind_ms1p5m)
      const yawDeg = toFiniteNumber(segment.yaw_deg)

      if (seq === null || windSpeedMs === null || yawDeg === null) {
        return null
      }

      return {
        seq,
        windClass: segment.wind_class || 'wind',
        windSpeedMs,
        ...calculateWindVectorImpact(windSpeedMs, yawDeg),
      }
    })
    .filter((impact): impact is SegmentImpact => impact !== null)
    .sort((a, b) => a.seq - b.seq)

  if (impacts.length === 0) {
    return null
  }

  const total = impacts.reduce(
    (accumulator, impact) => ({
      windSpeedMs: accumulator.windSpeedMs + impact.windSpeedMs,
      headwindComponentMs: accumulator.headwindComponentMs + impact.headwindComponentMs,
      aeroLoadDeltaPct: accumulator.aeroLoadDeltaPct + impact.aeroLoadDeltaPct,
    }),
    { windSpeedMs: 0, headwindComponentMs: 0, aeroLoadDeltaPct: 0 },
  )

  const avgAeroLoadDeltaPct = total.aeroLoadDeltaPct / impacts.length
  const hardSectionThreshold = Math.max(75, avgAeroLoadDeltaPct * 1.15)

  return {
    segmentCount: impacts.length,
    avgWindSpeedMs: total.windSpeedMs / impacts.length,
    maxWindSpeedMs: Math.max(...impacts.map(impact => impact.windSpeedMs)),
    avgHeadwindComponentMs: total.headwindComponentMs / impacts.length,
    avgAeroLoadDeltaPct,
    hardestSection: findBestSection(
      impacts,
      impact => impact.aeroLoadDeltaPct >= hardSectionThreshold,
      'hardest',
    ) || findBestWindow(impacts, 'hardest', 5),
    reliefSection: findBestSection(
      impacts,
      impact => impact.aeroLoadDeltaPct <= -10 || impact.headwindComponentMs <= -0.75,
      'relief',
    ),
  }
}

const findBestSection = (
  impacts: SegmentImpact[],
  includesImpact: (impact: SegmentImpact) => boolean,
  mode: 'hardest' | 'relief',
): WindSectionInsight | null => {
  const sections: SegmentImpact[][] = []
  let currentSection: SegmentImpact[] = []

  for (const impact of impacts) {
    const previousImpact = currentSection[currentSection.length - 1]
    const isContiguous = !previousImpact || impact.seq === previousImpact.seq + 1

    if (includesImpact(impact) && isContiguous) {
      currentSection.push(impact)
      continue
    }

    if (currentSection.length > 0) {
      sections.push(currentSection)
    }
    currentSection = includesImpact(impact) ? [impact] : []
  }

  if (currentSection.length > 0) {
    sections.push(currentSection)
  }

  if (sections.length === 0) {
    return null
  }

  const rankedSections = sections
    .map(section => ({
      section,
      score: section.reduce((total, impact) => {
        const load = mode === 'hardest'
          ? Math.max(0, impact.aeroLoadDeltaPct)
          : Math.max(0, -impact.aeroLoadDeltaPct)

        return total + load
      }, 0),
    }))
    .sort((a, b) => b.score - a.score)

  return summarizeSection(rankedSections[0].section)
}

const summarizeSection = (section: SegmentImpact[]): WindSectionInsight => {
  const totals = section.reduce(
    (accumulator, impact) => ({
      windSpeedMs: accumulator.windSpeedMs + impact.windSpeedMs,
      headwindComponentMs: accumulator.headwindComponentMs + impact.headwindComponentMs,
      aeroLoadDeltaPct: accumulator.aeroLoadDeltaPct + impact.aeroLoadDeltaPct,
    }),
    { windSpeedMs: 0, headwindComponentMs: 0, aeroLoadDeltaPct: 0 },
  )
  const windClassCounts = section.reduce<Record<string, number>>((counts, impact) => {
    counts[impact.windClass] = (counts[impact.windClass] || 0) + 1

    return counts
  }, {})
  const dominantWindClass = Object.entries(windClassCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'wind'

  return {
    startKm: section[0].seq,
    endKm: section[section.length - 1].seq + 1,
    lengthKm: section.length,
    avgWindSpeedMs: totals.windSpeedMs / section.length,
    avgHeadwindComponentMs: totals.headwindComponentMs / section.length,
    avgAeroLoadDeltaPct: totals.aeroLoadDeltaPct / section.length,
    peakAeroLoadDeltaPct: section.reduce((peak, impact) => (
      Math.abs(impact.aeroLoadDeltaPct) > Math.abs(peak) ? impact.aeroLoadDeltaPct : peak
    ), section[0].aeroLoadDeltaPct),
    dominantWindClass,
  }
}

const findBestWindow = (
  impacts: SegmentImpact[],
  mode: 'hardest' | 'relief',
  targetLengthKm: number,
): WindSectionInsight | null => {
  if (impacts.length === 0) {
    return null
  }

  const windowLength = Math.min(targetLengthKm, impacts.length)
  const windows: SegmentImpact[][] = []

  for (let index = 0; index <= impacts.length - windowLength; index += 1) {
    const window = impacts.slice(index, index + windowLength)
    const isContiguous = window.every((impact, windowIndex) => (
      windowIndex === 0 || impact.seq === window[windowIndex - 1].seq + 1
    ))

    if (isContiguous) {
      windows.push(window)
    }
  }

  if (windows.length === 0) {
    return summarizeSection(impacts.slice(0, windowLength))
  }

  const rankedWindows = windows
    .map(window => ({
      window,
      score: window.reduce((total, impact) => {
        const load = mode === 'hardest' ? impact.aeroLoadDeltaPct : -impact.aeroLoadDeltaPct

        return total + load
      }, 0),
    }))
    .sort((a, b) => b.score - a.score)

  return summarizeSection(rankedWindows[0].window)
}
