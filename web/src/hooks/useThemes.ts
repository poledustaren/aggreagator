/**
 * Хук дерева тематик (persistent themes). Читает /v1/themes — сервер отдаёт
 * СОХРАНЁННЫЕ темы (ничего не регенерит), клиент собирает дерево по parent_id.
 */

import { useQuery } from '@tanstack/react-query'
import { fetchThemes } from '../api/client'
import type { ThemeNode } from '../types/api'

export function useThemes() {
  return useQuery({
    queryKey: ['themes'],
    queryFn: fetchThemes,
    staleTime: 60_000,
  })
}

export interface ThemeTreeNode extends ThemeNode {
  children: ThemeTreeNode[]
  // Свёрнутые по поддереву агрегаты (для сортировки и заголовков).
  rollupInbox: number
  rollupMaxImportance: number
  rollupLastActivity: string
}

/** Собирает дерево из плоского списка + считает свёрнутые агрегаты по поддереву. */
export function buildThemeTree(themes: ThemeNode[]): ThemeTreeNode[] {
  const byId = new Map<string, ThemeTreeNode>()
  for (const t of themes) {
    byId.set(t.id, {
      ...t,
      children: [],
      rollupInbox: t.inbox_count,
      rollupMaxImportance: t.max_importance,
      rollupLastActivity: t.last_activity_at,
    })
  }
  const roots: ThemeTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  // Свёртка агрегатов снизу вверх.
  const rollup = (node: ThemeTreeNode): void => {
    for (const c of node.children) {
      rollup(c)
      node.rollupInbox += c.rollupInbox
      node.rollupMaxImportance = Math.max(node.rollupMaxImportance, c.rollupMaxImportance)
      if (c.rollupLastActivity > node.rollupLastActivity) node.rollupLastActivity = c.rollupLastActivity
    }
  }
  roots.forEach(rollup)
  return roots
}

export type ThemeSort = 'recency' | 'importance'

export function sortThemeTree(nodes: ThemeTreeNode[], sort: ThemeSort): ThemeTreeNode[] {
  const cmp = (a: ThemeTreeNode, b: ThemeTreeNode): number =>
    sort === 'importance'
      ? b.rollupMaxImportance - a.rollupMaxImportance
      : b.rollupLastActivity.localeCompare(a.rollupLastActivity)
  const sortRec = (list: ThemeTreeNode[]): ThemeTreeNode[] => {
    const sorted = [...list].sort(cmp)
    for (const n of sorted) n.children = sortRec(n.children)
    return sorted
  }
  return sortRec(nodes)
}
