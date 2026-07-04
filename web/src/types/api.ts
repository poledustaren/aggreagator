/**
 * Типы 1:1 с contracts/openapi.yaml (Aggregat API v1.0.0).
 * Не добавляй сюда полей, которых нет в контракте — при расхождении
 * правь контракт и синхронизируй типы вручную.
 */

// ---------- Общие enum'ы ----------

export type ItemStatus = 'inbox' | 'snoozed' | 'done' | 'dismissed'

export type ClassifiedBy = 'rules' | 'llm' | 'manual'

export type ProcessStatus = 'open' | 'frozen' | 'closed'

// ---------- Devices ----------

export interface DeviceRegisterRequest {
  platform: 'android'
  device_name: string
  push_token?: string
}

export interface DeviceRegisterResponse {
  device_id: string
  token: string
}

// ---------- Items ----------

export interface Item {
  id: string
  title: string
  summary: string
  importance: number // 0-100
  status: ItemStatus
  suggested_action: string
  area_id: string | null
  project_id: string | null
  group_id: string | null
  process_id: string | null
  tags: string[]
  source_apps: string[]
  classified_by: ClassifiedBy
  confidence: number // 0-1
  snoozed_until: string | null // date-time
  due_at: string | null // date-time — срок/дедлайн, вычлененный LLM (H9)
  due_kind: 'deadline' | 'event' | 'payment' | null
  created_at: string
  updated_at: string
}

export interface ItemPatch {
  status?: ItemStatus
  snoozed_until?: string
  area_id?: string
  project_id?: string
  tags?: string[]
}

export interface ItemPage {
  items: Item[]
  next_cursor: string | null
}

export interface ItemsQuery {
  importance_min?: number
  area_id?: string
  project_id?: string
  theme_id?: string
  tag?: string
  status?: ItemStatus
  from?: string
  cursor?: string
  limit?: number
}

// ---------- Themes (тематики) ----------

export interface ThemeNode {
  id: string
  name: string
  parent_id: string | null
  depth: number
  summary: string | null
  last_activity_at: string
  inbox_count: number
  max_importance: number
  process_count: number
}

export interface ThemeList {
  themes: ThemeNode[]
}

// ---------- Groups ----------

export interface Group {
  id: string
  title: string
  importance: number
  item_count: number
  area_id: string | null
  project_id: string | null
  last_activity_at: string
  items: Item[]
}

export interface GroupPage {
  groups: Group[]
  next_cursor: string | null
}

export interface GroupsQuery {
  status?: ItemStatus
  cursor?: string
  limit?: number
}

// ---------- Areas ----------

export interface Area {
  id: string
  name: string
  color?: string
  sort?: number
}

export interface AreaInput {
  name: string
  color?: string
  sort?: number
}

// ---------- Projects ----------

export interface Project {
  id: string
  area_id: string
  name: string
  active: boolean
  due_at: string | null
}

export interface ProjectInput {
  area_id: string
  name: string
  active?: boolean
  due_at?: string
}

// ---------- Rules ----------

export interface RuleMatch {
  source_app?: string
  title_regex?: string
  text_regex?: string
  category?: string
}

export interface RuleAction {
  set_area_id?: string
  set_project_id?: string
  add_tags?: string[]
  set_importance?: number
  confident?: boolean
}

export interface Rule {
  id: string
  name: string
  priority: number
  match: RuleMatch
  action: RuleAction
  enabled: boolean
}

export interface RuleInput {
  name: string
  priority?: number
  match: RuleMatch
  action: RuleAction
  enabled?: boolean
}

// ---------- Processes ----------

export interface Process {
  id: string
  title: string | null
  summary: string | null
  status: ProcessStatus
  area_id: string | null
  project_id: string | null
  started_at: string
  last_activity_at: string
  ended_at: string | null
  item_count: number
}

export interface ProcessDetail extends Process {
  items: Item[]
}

export interface ProcessPage {
  processes: Process[]
  next_cursor: string | null
}

export interface ProcessesQuery {
  status?: ProcessStatus
  area_id?: string
  project_id?: string
  cursor?: string
  limit?: number
}

export interface ProcessTimelineEntry {
  id: string
  title: string | null
  status: ProcessStatus
  area_id: string | null
  project_id: string | null
  start: string
  end: string | null
  item_count: number
}

export interface ProcessTimeline {
  entries: ProcessTimelineEntry[]
}

// ---------- Process graph (раздел «Связи») ----------

// Тип связи между процессами — см. server/app/pipeline/relation_finder.py
export type GraphRelation = 'same_entity' | 'causal' | 'follow_up' | 'same_project' | 'related'

export interface GraphNode {
  id: string
  title: string | null
  status: ProcessStatus
  area_id: string | null
  start: string
  end: string
  item_count: number
  theme: string | null
}

export interface GraphEdge {
  source: string
  target: string
  relation: string // строка на сервере (GraphRelation — известные значения, но парсим как string)
  reason: string
  confidence: number
}

export interface GraphTheme {
  name: string
  process_ids: string[]
}

export interface ProcessGraph {
  window_from: string | null
  window_to: string | null
  nodes: GraphNode[]
  themes: GraphTheme[]
  edges: GraphEdge[]
  truncated: boolean
}

// ---------- Stats ----------

export interface StatusCounts {
  inbox: number
  snoozed: number
  done: number
  dismissed: number
}

export interface ImportanceBuckets {
  low: number // 0-33
  mid: number // 34-66
  high: number // 67-100
}

export interface ProcessCounts {
  open: number
  frozen: number
  closed: number
  total: number
}

export interface Overview {
  total_items: number
  by_status: StatusCounts
  by_importance: ImportanceBuckets
  items_last_7d: number
  processes: ProcessCounts
}

export interface AreaStat {
  area_id: string | null
  area_name: string | null
  item_count: number
  avg_importance: number
}

export interface SourceStat {
  source_app: string
  item_count: number
}

export type StatsBucket = 'day' | 'week' | 'month'

export interface TimelineBucket {
  bucket_start: string
  count: number
}

export interface StatsTimeline {
  bucket: string
  buckets: TimelineBucket[]
}

// ---------- Search ----------

export interface SearchRequest {
  query: string
  limit?: number
}

export interface SearchHit {
  item: Item
  similarity: number
}

export interface SearchResponse {
  hits: SearchHit[]
}

// ---------- Errors ----------

export interface ApiError {
  error: string
  detail?: string
}
