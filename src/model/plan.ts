import { requiredConstraint } from '../engine/rules'
import { t } from '../i18n'
import type { Id, Shift, Workspace } from '../engine/types'
import { overlapsPeriod, withinPeriod } from './period'
import { formatDateTime, MINUTE, onGrid } from './time'
import { newId } from './workspace'

// Planning replaces every shift in the period that is neither fixed nor already started at the planning start.

const kept = (workspace: Workspace, s: Shift, from: number) => s.fixed || s.start < from || !overlapsPeriod(workspace, s)

/** The shifts a plan from `from` leaves in place. */
export const keptShifts = (workspace: Workspace, from: number) => workspace.shifts.filter(s => kept(workspace, s, from))

/** What the engine sees: the period's contents, with kept shifts fixed and the rest dropped. */
export function planInput(workspace: Workspace, from: number): Workspace {
  const inside = withinPeriod(workspace)
  return { ...inside, shifts: keptShifts(inside, from).map(s => ({ ...s, fixed: true })) }
}

/** Why the rules can't be planned with, if they can't. */
export function rulesProblem(workspace: Workspace) {
  const { rules } = workspace
  const maxShift = requiredConstraint(rules, 'maxShift').minutes
  const minRest = requiredConstraint(rules, 'minRest').minutes
  if (maxShift < rules.stepMinutes) return t().problems.maxShiftTooShort
  if (minRest <= 0) return t().problems.restZero
}

/** Future coverage and kept shifts must lie on the step grid; returns one message per offender. */
export function gridProblems(all: Workspace, from: number): string[] {
  const workspace = withinPeriod(all)
  const { stepMinutes } = workspace.rules
  const position = new Map(workspace.positions.map(p => [p.id, p.name]))
  const person = new Map(workspace.people.map(p => [p.id, p.name]))
  const off = (time: number) => time > from && !onGrid(time, stepMinutes)
  const problems: string[] = []
  for (const c of workspace.coverage) {
    if (off(c.start) || off(c.end)) problems.push(t().plan.offGridCoverage(position.get(c.positionId) ?? '', formatDateTime(c.start)))
  }
  for (const s of workspace.shifts) {
    if (kept(workspace, s, from) && (off(s.start) || off(s.end))) problems.push(t().plan.offGridShift(person.get(s.personId) ?? '', formatDateTime(s.start)))
  }
  return problems
}

export function acceptPlan(workspace: Workspace, from: number, planned: Shift[]): Workspace {
  return { ...workspace, shifts: [...keptShifts(workspace, from), ...planned.map(s => ({ ...s, id: newId() }))] }
}

export interface Totals {
  pastMinutes: number
  futureMinutes: number
  futureShifts: number
  /** Minutes times position weight, over all shifts in the period. */
  load: number
}

/** Per-person totals over the shifts in the period, as planning counts them. */
export function totals(workspace: Workspace, shifts: Shift[], now: number): Map<Id, Totals> {
  const weight = new Map(workspace.positions.map(p => [p.id, p.weight]))
  const result = new Map(workspace.people.map(p => [p.id, { pastMinutes: 0, futureMinutes: 0, futureShifts: 0, load: 0 }]))
  for (const s of shifts.filter(s => overlapsPeriod(workspace, s))) {
    const t = result.get(s.personId)
    if (!t) continue
    const past = Math.max(0, Math.min(s.end, now) - s.start) / MINUTE
    const minutes = (s.end - s.start) / MINUTE
    t.pastMinutes += past
    t.futureMinutes += minutes - past
    if (s.start >= now) t.futureShifts++
    t.load += minutes * (weight.get(s.positionId) ?? 1)
  }
  return result
}
