/**
 * Централизованный API-клиент: fetch-обёртка с base URL + Authorization
 * из настроек. При 401 бросает специальную ошибку UnauthorizedError,
 * на которую подписывается роутер и уводит пользователя на /settings.
 */

import { loadSettings } from './settings'
import type {
  Area,
  AreaInput,
  AreaStat,
  DeviceRegisterRequest,
  DeviceRegisterResponse,
  GroupPage,
  GroupsQuery,
  Item,
  ItemPage,
  ItemPatch,
  ItemsQuery,
  Overview,
  ProcessDetail,
  ProcessGraph,
  ProcessPage,
  ProcessTimeline,
  ProcessesQuery,
  Project,
  ProjectInput,
  Rule,
  RuleInput,
  SearchRequest,
  SearchResponse,
  SourceStat,
  StatsBucket,
  StatsTimeline,
  ThemeList,
} from '../types/api'

export class UnauthorizedError extends Error {
  constructor() {
    super('401 Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

export class ApiRequestError extends Error {
  status: number
  detail?: string
  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.detail = detail
  }
}

// Слушатели 401 (см. UnauthorizedError) — используется в App для редиректа
type UnauthorizedListener = () => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const { baseUrl } = loadSettings()
  const trimmedBase = baseUrl.replace(/\/+$/, '')
  const url = new URL(`${trimmedBase}${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

async function request<T>(
  path: string,
  options: {
    method?: string
    query?: Record<string, string | number | undefined>
    body?: unknown
    skipAuth?: boolean
  } = {},
): Promise<T> {
  const { method = 'GET', query, body, skipAuth } = options
  const { token } = loadSettings()

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (!skipAuth && token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new ApiRequestError(0, 'Сеть недоступна или сервер не отвечает', String(err))
  }

  if (response.status === 401) {
    unauthorizedListeners.forEach((l) => l())
    throw new UnauthorizedError()
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const data = text ? JSON.parse(text) : undefined

  if (!response.ok) {
    const message = data?.error ?? `Ошибка запроса: ${response.status}`
    throw new ApiRequestError(response.status, message, data?.detail)
  }

  return data as T
}

// ---------- Devices ----------

export function registerDevice(payload: DeviceRegisterRequest): Promise<DeviceRegisterResponse> {
  return request<DeviceRegisterResponse>('/devices:register', {
    method: 'POST',
    body: payload,
    skipAuth: true,
  })
}

// ---------- Items ----------

export function fetchItems(query: ItemsQuery): Promise<ItemPage> {
  return request<ItemPage>('/items', { query: query as Record<string, string | number | undefined> })
}

export function fetchItem(id: string): Promise<Item> {
  return request<Item>(`/items/${id}`)
}

export function fetchThemes(): Promise<ThemeList> {
  return request<ThemeList>('/themes')
}

export function patchItem(id: string, patch: ItemPatch): Promise<Item> {
  return request<Item>(`/items/${id}`, { method: 'PATCH', body: patch })
}

// ---------- Groups ----------

export function fetchGroups(query: GroupsQuery): Promise<GroupPage> {
  return request<GroupPage>('/groups', { query: query as Record<string, string | number | undefined> })
}

// ---------- Areas ----------

export function fetchAreas(): Promise<Area[]> {
  return request<Area[]>('/areas')
}

export function createArea(input: AreaInput): Promise<Area> {
  return request<Area>('/areas', { method: 'POST', body: input })
}

export function updateArea(id: string, input: AreaInput): Promise<Area> {
  return request<Area>(`/areas/${id}`, { method: 'PATCH', body: input })
}

export function deleteArea(id: string): Promise<void> {
  return request<void>(`/areas/${id}`, { method: 'DELETE' })
}

// ---------- Projects ----------

export function fetchProjects(areaId?: string): Promise<Project[]> {
  return request<Project[]>('/projects', { query: { area_id: areaId } })
}

export function createProject(input: ProjectInput): Promise<Project> {
  return request<Project>('/projects', { method: 'POST', body: input })
}

export function updateProject(id: string, input: ProjectInput): Promise<Project> {
  return request<Project>(`/projects/${id}`, { method: 'PATCH', body: input })
}

export function deleteProject(id: string): Promise<void> {
  return request<void>(`/projects/${id}`, { method: 'DELETE' })
}

// ---------- Rules ----------

export function fetchRules(): Promise<Rule[]> {
  return request<Rule[]>('/rules')
}

export function createRule(input: RuleInput): Promise<Rule> {
  return request<Rule>('/rules', { method: 'POST', body: input })
}

export function updateRule(id: string, input: RuleInput): Promise<Rule> {
  return request<Rule>(`/rules/${id}`, { method: 'PATCH', body: input })
}

export function deleteRule(id: string): Promise<void> {
  return request<void>(`/rules/${id}`, { method: 'DELETE' })
}

// ---------- Tags ----------

export function fetchTags(): Promise<string[]> {
  return request<string[]>('/tags')
}

// ---------- Processes ----------

export function fetchProcesses(query: ProcessesQuery): Promise<ProcessPage> {
  return request<ProcessPage>('/processes', { query: query as Record<string, string | number | undefined> })
}

export function fetchProcess(id: string): Promise<ProcessDetail> {
  return request<ProcessDetail>(`/processes/${id}`)
}

export function fetchProcessTimeline(from?: string, to?: string): Promise<ProcessTimeline> {
  return request<ProcessTimeline>('/processes/timeline', { query: { from, to } })
}

// Граф связей: LLM на лету (запрос может занимать несколько секунд), 503 если LLM выключен.
export function fetchProcessGraph(from: string, to: string): Promise<ProcessGraph> {
  return request<ProcessGraph>('/processes/graph', { query: { from, to } })
}

// ---------- Stats ----------

export function fetchStatsOverview(): Promise<Overview> {
  return request<Overview>('/stats/overview')
}

export function fetchStatsByArea(): Promise<AreaStat[]> {
  return request<AreaStat[]>('/stats/by-area')
}

export function fetchStatsBySource(): Promise<SourceStat[]> {
  return request<SourceStat[]>('/stats/by-source')
}

export function fetchStatsTimeline(bucket: StatsBucket, from?: string, to?: string): Promise<StatsTimeline> {
  return request<StatsTimeline>('/stats/timeline', { query: { bucket, from, to } })
}

// ---------- Search ----------

export function searchItems(payload: SearchRequest): Promise<SearchResponse> {
  return request<SearchResponse>('/search', { method: 'POST', body: payload })
}
