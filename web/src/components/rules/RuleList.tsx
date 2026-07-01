/**
 * Список правил с возможностью редактирования и удаления.
 */

import { useState } from 'react'
import type { Area, Project, Rule, RuleInput } from '../../types/api'
import { RuleForm } from './RuleForm'

export function RuleList({
  rules,
  areas,
  projects,
  onUpdate,
  onDelete,
  updating,
}: {
  rules: Rule[]
  areas: Area[]
  projects: Project[]
  onUpdate: (id: string, input: RuleInput) => void
  onDelete: (id: string) => void
  updating: boolean
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  if (rules.length === 0) {
    return <p className="text-sm text-neutral-500">Правил пока нет</p>
  }

  const sorted = [...rules].sort((a, b) => a.priority - b.priority)

  return (
    <ul className="space-y-2">
      {sorted.map((rule) => {
        if (editingId === rule.id) {
          return (
            <li key={rule.id}>
              <RuleForm
                areas={areas}
                projects={projects}
                initial={{
                  name: rule.name,
                  priority: rule.priority,
                  match: rule.match,
                  action: rule.action,
                  enabled: rule.enabled,
                }}
                submitting={updating}
                onCancel={() => setEditingId(null)}
                onSubmit={(input) => {
                  onUpdate(rule.id, input)
                  setEditingId(null)
                }}
              />
            </li>
          )
        }

        return (
          <li
            key={rule.id}
            className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
          >
            <div className="text-sm">
              <span className={rule.enabled ? 'text-neutral-200' : 'text-neutral-500 line-through'}>{rule.name}</span>
              <span className="ml-2 text-xs text-neutral-500">приоритет {rule.priority}</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setEditingId(rule.id)} className="text-xs text-neutral-500 hover:text-neutral-200">
                Редактировать
              </button>
              <button onClick={() => onDelete(rule.id)} className="text-xs text-neutral-500 hover:text-red-400">
                Удалить
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
