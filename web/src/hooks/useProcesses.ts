/**
 * Хуки для процессов: список с cursor-пагинацией, одиночный процесс с items,
 * таймлайн-выборка за диапазон дат, граф связей (LLM на лету).
 */

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { ApiRequestError, fetchProcess, fetchProcessGraph, fetchProcesses, fetchProcessTimeline } from '../api/client'
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

/**
 * Граф связей: запрос дорогой (LLM на лету, ~несколько секунд), поэтому
 * держим результат «свежим» дольше обычного и НЕ ретраим 503 (LLM выключен
 * на сервере — повторные попытки бессмысленны, только продлевают ожидание).
 */
export function useProcessGraph(from: string | undefined, to: string | undefined) {
  const queryClient = useQueryClient()
  const [regenerating, setRegenerating] = useState(false)

  const query = useQuery({
    queryKey: ['processGraph', from, to] as const,
    queryFn: () => fetchProcessGraph(from as string, to as string),
    enabled: !!from && !!to,
    staleTime: 30 * 60_000, // граф теперь кэшируется на сервере — не дёргаем LLM зря
    retry: (failureCount, error) => {
      if (error instanceof ApiRequestError && error.status === 503) return false
      return failureCount < 1
    },
  })

  // Принудительный пересчёт (обход серверного кэша) — по кнопке «Обновить связи».
  const regenerate = useCallback(async () => {
    if (!from || !to) return
    setRegenerating(true)
    try {
      const fresh = await fetchProcessGraph(from, to, true)
      queryClient.setQueryData(['processGraph', from, to], fresh)
    } finally {
      setRegenerating(false)
    }
  }, [from, to, queryClient])

  return { ...query, regenerate, regenerating }
}
