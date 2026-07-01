/**
 * CRUD-хуки для Rule (правила автотегирования).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createRule, deleteRule, fetchRules, updateRule } from '../api/client'
import type { RuleInput } from '../types/api'

export const rulesQueryKey = ['rules'] as const

export function useRules() {
  return useQuery({
    queryKey: rulesQueryKey,
    queryFn: fetchRules,
  })
}

export function useCreateRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RuleInput) => createRule(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesQueryKey }),
  })
}

export function useUpdateRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RuleInput }) => updateRule(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesQueryKey }),
  })
}

export function useDeleteRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesQueryKey }),
  })
}
