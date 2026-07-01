/**
 * Хуки для экрана статистики: overview, разбивки по зоне/источнику, таймлайн по бакетам.
 */

import { useQuery } from '@tanstack/react-query'
import { fetchStatsByArea, fetchStatsBySource, fetchStatsOverview, fetchStatsTimeline } from '../api/client'
import type { StatsBucket } from '../types/api'

export function useStatsOverview() {
  return useQuery({
    queryKey: ['stats', 'overview'] as const,
    queryFn: fetchStatsOverview,
  })
}

export function useStatsByArea() {
  return useQuery({
    queryKey: ['stats', 'by-area'] as const,
    queryFn: fetchStatsByArea,
  })
}

export function useStatsBySource() {
  return useQuery({
    queryKey: ['stats', 'by-source'] as const,
    queryFn: fetchStatsBySource,
  })
}

export function useStatsTimeline(bucket: StatsBucket) {
  return useQuery({
    queryKey: ['stats', 'timeline', bucket] as const,
    queryFn: () => fetchStatsTimeline(bucket),
  })
}
