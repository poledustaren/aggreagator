/**
 * Простая форма создания/редактирования правила: match (AND) + action.
 */

import { useState } from 'react'
import type { Area, Project, RuleInput } from '../../types/api'

const emptyRule = (): RuleInput => ({
  name: '',
  priority: 100,
  match: {},
  action: {},
  enabled: true,
})

export function RuleForm({
  areas,
  projects,
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  areas: Area[]
  projects: Project[]
  initial?: RuleInput
  onSubmit: (input: RuleInput) => void
  onCancel?: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState<RuleInput>(initial ?? emptyRule())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onSubmit(form)
    if (!initial) setForm(emptyRule())
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex gap-2">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Название правила"
          className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
        />
        <input
          type="number"
          value={form.priority ?? 100}
          onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
          className="w-24 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
          title="Приоритет (меньше = раньше)"
        />
        <label className="flex items-center gap-1.5 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={form.enabled ?? true}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          включено
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <fieldset className="space-y-1.5 rounded border border-neutral-800 p-2">
          <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">Match (AND)</legend>
          <input
            value={form.match.source_app ?? ''}
            onChange={(e) => setForm({ ...form, match: { ...form.match, source_app: e.target.value || undefined } })}
            placeholder="source_app (package name)"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          />
          <input
            value={form.match.title_regex ?? ''}
            onChange={(e) => setForm({ ...form, match: { ...form.match, title_regex: e.target.value || undefined } })}
            placeholder="title_regex"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          />
          <input
            value={form.match.text_regex ?? ''}
            onChange={(e) => setForm({ ...form, match: { ...form.match, text_regex: e.target.value || undefined } })}
            placeholder="text_regex"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          />
          <input
            value={form.match.category ?? ''}
            onChange={(e) => setForm({ ...form, match: { ...form.match, category: e.target.value || undefined } })}
            placeholder="category"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          />
        </fieldset>

        <fieldset className="space-y-1.5 rounded border border-neutral-800 p-2">
          <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">Action</legend>
          <select
            value={form.action.set_area_id ?? ''}
            onChange={(e) => setForm({ ...form, action: { ...form.action, set_area_id: e.target.value || undefined } })}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          >
            <option value="">set_area_id: —</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={form.action.set_project_id ?? ''}
            onChange={(e) => setForm({ ...form, action: { ...form.action, set_project_id: e.target.value || undefined } })}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          >
            <option value="">set_project_id: —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={form.action.add_tags?.join(', ') ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                action: {
                  ...form.action,
                  add_tags: e.target.value
                    ? e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
                    : undefined,
                },
              })
            }
            placeholder="add_tags (через запятую)"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={form.action.set_importance ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                action: { ...form.action, set_importance: e.target.value ? Number(e.target.value) : undefined },
              })
            }
            placeholder="set_importance (0-100)"
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
          />
          <label className="flex items-center gap-1.5 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={form.action.confident ?? false}
              onChange={(e) => setForm({ ...form, action: { ...form.action, confident: e.target.checked } })}
            />
            confident (завершает пайплайн без LLM)
          </label>
        </fieldset>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800">
            Отмена
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !form.name.trim()}
          className="rounded-md bg-emerald-600/20 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
        >
          {initial ? 'Сохранить' : 'Создать правило'}
        </button>
      </div>
    </form>
  )
}
