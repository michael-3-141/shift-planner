import type { Constraint, Id, Rules, Workspace } from '../engine/types'
import { t } from '../i18n'
import { weekAround } from './period'

export const STEP_OPTIONS = [15, 30, 60, 120]

export const emptyWorkspace = (): Workspace => ({
  people: [],
  positions: [],
  coverage: [],
  unavailable: [],
  shifts: [],
  rules: defaultRules(),
  // Most work is planned a week at a time; the period can be changed or removed in settings.
  period: weekAround(Date.now()),
})

export function defaultRules(): Rules {
  return {
    stepMinutes: 60,
    constraints: [
      { kind: 'maxShift', enabled: true, minutes: 4 * 60 },
      { kind: 'minRest', enabled: true, minutes: 8 * 60 },
      { kind: 'preferredHandovers', enabled: true, everyMinutes: 4 * 60, firstMinutes: 2 * 60, allowedExtraMinutes: 2 * 60 },
    ],
  }
}

/** 128 random bits as hex. crypto.randomUUID would do, but it only exists on HTTPS pages, and the app also runs over plain HTTP, e.g. on a local network. */
export const newId = (): Id => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')

const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#86bcb6', '#d37295']

/** The first palette color nobody uses yet. */
export const nextColor = (used: string[]) => PALETTE.find(c => !used.includes(c)) ?? PALETTE[used.length % PALETTE.length]

/** Removes a person or position along with everything that refers to it. */
export function removePerson(w: Workspace, id: Id): Workspace {
  return { ...w, people: w.people.filter(p => p.id !== id), unavailable: w.unavailable.filter(u => u.personId !== id), shifts: w.shifts.filter(s => s.personId !== id) }
}

export function removePosition(w: Workspace, id: Id): Workspace {
  return { ...w, positions: w.positions.filter(p => p.id !== id), coverage: w.coverage.filter(c => c.positionId !== id), shifts: w.shifts.filter(s => s.positionId !== id) }
}

const FORMAT = 'shift-planner'
const VERSION = 2

export const serializeWorkspace = (workspace: Workspace) => JSON.stringify({ format: FORMAT, version: VERSION, workspace }, null, 2)

/** Parses an exported file, throwing an Error that says what is wrong. */
export function parseWorkspace(text: string): Workspace {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(t().file.notJson)
  }
  const file = data as { format?: unknown; version?: unknown; workspace?: unknown }
  if (file?.format !== FORMAT) throw new Error(t().file.notOurs)
  if (file.version !== VERSION) throw new Error(t().file.version(String(file.version)))
  const w = file.workspace as Workspace

  // The detail names the broken part in the file's own (English) terms.
  const fail = (what: string) => { throw new Error(t().file.invalid(what)) }
  const isString = (v: unknown) => typeof v === 'string'
  const isNumber = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  const list = <T,>(name: keyof Workspace, check: (x: T) => boolean) => {
    const value = w?.[name]
    if (!Array.isArray(value)) fail(`${name} is missing`)
    ;(value as T[]).forEach((x, i) => { if (!x || typeof x !== 'object' || !check(x)) fail(`${name} entry ${i + 1}`) })
  }
  const interval = (x: { start: unknown; end: unknown }) => isNumber(x.start) && isNumber(x.end) && (x.start as number) < (x.end as number)

  list<Workspace['people'][number]>('people', p => isString(p.id) && isString(p.name) && isString(p.color))
  list<Workspace['positions'][number]>('positions', p => isString(p.id) && isString(p.name) && isString(p.color) && isNumber(p.weight) && p.weight > 0)
  const people = new Set(w.people.map(p => p.id))
  const positions = new Set(w.positions.map(p => p.id))
  list<Workspace['coverage'][number]>('coverage', c => isString(c.id) && positions.has(c.positionId) && interval(c) && (c.seriesId === undefined || isString(c.seriesId)))
  list<Workspace['unavailable'][number]>('unavailable', u => isString(u.id) && people.has(u.personId) && interval(u))
  list<Workspace['shifts'][number]>('shifts', s => isString(s.id) && people.has(s.personId) && positions.has(s.positionId) && typeof s.fixed === 'boolean' && interval(s))
  const r = w.rules
  if (!r || !isNumber(r.stepMinutes) || !Array.isArray(r.constraints)) fail('rules')
  const validConstraint = (c: Constraint) => {
    switch (c.kind) {
      case 'maxShift':
      case 'minRest':
        return isNumber(c.minutes)
      case 'preferredHandovers':
        return isNumber(c.everyMinutes) && c.everyMinutes > 0 && isNumber(c.firstMinutes) && isNumber(c.allowedExtraMinutes) && c.allowedExtraMinutes >= 0
      default:
        return false
    }
  }
  const kinds = new Set<string>()
  r.constraints.forEach((c, i) => {
    if (!c || kinds.has(c.kind) || typeof c.enabled !== 'boolean' || !validConstraint(c)) fail(`rule ${i + 1}`)
    kinds.add(c.kind)
  })
  if (!kinds.has('maxShift') || !kinds.has('minRest')) fail('rules need a longest shift and a shortest rest')
  if (w.period !== undefined && !(w.period && typeof w.period === 'object' && interval(w.period))) fail('period')
  return w
}
