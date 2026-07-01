/**
 * Хук для лент групп (тредов) с cursor-пагинацией.
 */

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchGroups, patchItem } from '../api/client'
import type { GroupsQuery, ItemPatch } from '../types/api'

export function useGroups(filters: GroupsQuery) {
  return useInfiniteQuery({
    queryKey: ['groups', filters] as const,
    queryFn: ({ pageParam }) => fetchGroups({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  })
}

/**
 * Действие над Item внутри треда. Полноценный оптимистичный апдейт вложенной
 * структуры групп сложнее, чем в плоской ленте, поэтому здесь просто
 * инвалидируем группы и items после ответа сервера.
 */
export function usePatchItemInGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ItemPatch }) => patchItem(id, patch),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
