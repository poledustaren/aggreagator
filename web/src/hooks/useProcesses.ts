/**
 * Хуки для процессов: список с cursor-пагинацией, одиночный процесс с items,
 * таймлайн-выборка за диапазон дат.
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { fetchProcess, fetchProcesses, fetchProcessTimeline } from '../api/client'
import type { ProcessesQuery } from '../types/api'

export function useProcesses(filters: ProcessesQuery) {
  return useInfiniteQuery({
    queryKey: ['processes', filters] as const,
    queryFn: ({ pageParam }) => fetchProcesses({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  })
}

export function useProcess(id: string | undefined) {
  return useQuery({
    queryKey: ['process', id] as const,
    queryFn: () => fetchProcess(id as string),
    enabled: !!id,
  })
}

export function useProcessTimeline(from?: string, to?: string) {
  return useQuery({
    queryKey: ['processTimeline', from, to] as const,
    queryFn: () => fetchProcessTimeline(from, to),
  })
}
