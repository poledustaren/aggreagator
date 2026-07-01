/**
 * CRUD-хуки для Area (GTD-зоны).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createArea, deleteArea, fetchAreas, updateArea } from '../api/client'
import type { AreaInput } from '../types/api'

export const areasQueryKey = ['areas'] as const

export function useAreas() {
  return useQuery({
    queryKey: areasQueryKey,
    queryFn: fetchAreas,
  })
}

export function useCreateArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AreaInput) => createArea(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: areasQueryKey }),
  })
}

export function useUpdateArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AreaInput }) => updateArea(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: areasQueryKey }),
  })
}

export function useDeleteArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteArea(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: areasQueryKey })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
