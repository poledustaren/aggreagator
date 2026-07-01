/**
 * Экран правил: список + CRUD.
 */

import { useAreas } from '../hooks/useAreas'
import { useProjects } from '../hooks/useProjects'
import { useCreateRule, useDeleteRule, useRules, useUpdateRule } from '../hooks/useRules'
import { RuleForm } from '../components/rules/RuleForm'
import { RuleList } from '../components/rules/RuleList'
import { LoadingState, ErrorState } from '../components/common/StateViews'

export function RulesPage() {
  const rulesResult = useRules()
  const areasResult = useAreas()
  const projectsResult = useProjects()
  const createRule = useCreateRule()
  const updateRule = useUpdateRule()
  const deleteRule = useDeleteRule()

  if (rulesResult.isLoading || areasResult.isLoading || projectsResult.isLoading) {
    return <LoadingState label="Загружаем правила..." />
  }

  if (rulesResult.isError) {
    return (
      <ErrorState
        message={rulesResult.error instanceof Error ? rulesResult.error.message : 'Не удалось загрузить правила'}
        onRetry={() => rulesResult.refetch()}
      />
    )
  }

  const rules = rulesResult.data ?? []
  const areas = areasResult.data ?? []
  const projects = projectsResult.data ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-neutral-100">Новое правило</h2>
        <RuleForm areas={areas} projects={projects} onSubmit={(input) => createRule.mutate(input)} submitting={createRule.isPending} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-neutral-100">Все правила</h2>
        <RuleList
          rules={rules}
          areas={areas}
          projects={projects}
          updating={updateRule.isPending}
          onUpdate={(id, input) => updateRule.mutate({ id, input })}
          onDelete={(id) => deleteRule.mutate(id)}
        />
      </section>
    </div>
  )
}
