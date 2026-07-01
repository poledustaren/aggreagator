/**
 * CRUD-хуки для Project (внутри Area).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createProject, deleteProject, fetchProjects, updateProject } from '../api/client'
import type { ProjectInput } from '../types/api'

export const projectsQueryKey = (areaId?: string) => ['projects', areaId] as const

export function useProjects(areaId?: string) {
  return useQuery({
    queryKey: projectsQueryKey(areaId),
    queryFn: () => fetchProjects(areaId),
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) => createProject(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProjectInput }) => updateProject(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
}
