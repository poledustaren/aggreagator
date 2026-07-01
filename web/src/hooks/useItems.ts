/**
 * Хуки для ленты Item: список с фильтрами (бесконечный скролл через cursor)
 * и мутация PATCH с оптимистичным апдейтом.
 */

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchItems, patchItem } from '../api/client'
import type { Item, ItemPatch, ItemsQuery } from '../types/api'

export const itemsQueryKey = (filters: ItemsQuery) => ['items', filters] as const

export function useItems(filters: ItemsQuery) {
  return useInfiniteQuery({
    queryKey: itemsQueryKey(filters),
    queryFn: ({ pageParam }) => fetchItems({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  })
}

export function usePatchItem(filters: ItemsQuery) {
  const queryClient = useQueryClient()
  const key = itemsQueryKey(filters)

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ItemPatch }) => patchItem(id, patch),
    // Оптимистичный апдейт: сразу меняем карточку в кэше, до ответа сервера
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)

      queryClient.setQueryData(key, (old: unknown) => {
        if (!old || typeof old !== 'object' || !('pages' in old)) return old
        const typed = old as { pages: { items: Item[]; next_cursor: string | null }[]; pageParams: unknown[] }
        return {
          ...typed,
          pages: typed.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
          })),
        }
      })

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous)
      }
    },
    onSettled: () => {
      // Инвалидируем всё, что связано с items и groups — статус/зона могли поменять счётчики
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}
