/**
 * Экран управления GTD-структурой: зоны и проекты (CRUD).
 */

import { useAreas, useCreateArea, useDeleteArea } from '../hooks/useAreas'
import { useCreateProject, useDeleteProject, useProjects, useUpdateProject } from '../hooks/useProjects'
import { AreaForm } from '../components/gtd/AreaForm'
import { AreaList } from '../components/gtd/AreaList'
import { ProjectForm } from '../components/gtd/ProjectForm'
import { ProjectList } from '../components/gtd/ProjectList'
import { LoadingState, ErrorState } from '../components/common/StateViews'
import type { Project } from '../types/api'

export function GtdPage() {
  const areasResult = useAreas()
  const projectsResult = useProjects()
  const createArea = useCreateArea()
  const deleteArea = useDeleteArea()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()

  const areas = areasResult.data ?? []
  const projects = projectsResult.data ?? []

  if (areasResult.isLoading || projectsResult.isLoading) {
    return <LoadingState label="Загружаем GTD-структуру..." />
  }

  if (areasResult.isError || projectsResult.isError) {
    return (
      <ErrorState
        message="Не удалось загрузить зоны/проекты"
        onRetry={() => {
          areasResult.refetch()
          projectsResult.refetch()
        }}
      />
    )
  }

  const handleToggleProject = (project: Project) => {
    updateProject.mutate({
      id: project.id,
      input: {
        area_id: project.area_id,
        name: project.name,
        active: !project.active,
        due_at: project.due_at ?? undefined,
      },
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-neutral-100">Зоны</h2>
        <AreaForm onSubmit={(input) => createArea.mutate(input)} submitting={createArea.isPending} />
        <AreaList areas={areas} onDelete={(id) => deleteArea.mutate(id)} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-neutral-100">Проекты</h2>
        {areas.length === 0 ? (
          <p className="text-sm text-neutral-500">Сначала создайте хотя бы одну зону</p>
        ) : (
          <>
            <ProjectForm areas={areas} onSubmit={(input) => createProject.mutate(input)} submitting={createProject.isPending} />
            <ProjectList
              projects={projects}
              areas={areas}
              onToggleActive={handleToggleProject}
              onDelete={(id) => deleteProject.mutate(id)}
            />
          </>
        )}
      </section>
    </div>
  )
}
