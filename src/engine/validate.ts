import { requiredConstraint } from './rules'
import type { Shift, Workspace } from './types'

const MINUTE = 60_000

/** Check planned shifts against the workspace rules. Returns human-readable problems (empty when valid). */
export function validatePlan(workspace: Workspace, from: number, planned: Shift[]): string[] {
  const { rules } = workspace
  const maxShift = requiredConstraint(rules, 'maxShift').minutes
  const minRest = requiredConstraint(rules, 'minRest').minutes
  const problems: string[] = []
  const fixed = workspace.shifts.filter(s => s.fixed)
  const label = (s: Shift) => `${s.personId}/${s.positionId} ${new Date(s.start).toISOString()}–${new Date(s.end).toISOString()}`

  for (const s of planned) {
    if (s.start < from) problems.push(`starts before planning start: ${label(s)}`)
    if (s.end - s.start > maxShift * MINUTE) problems.push(`too long: ${label(s)}`)
    if ((s.start - from) % (rules.stepMinutes * MINUTE) || (s.end - from) % (rules.stepMinutes * MINUTE)) problems.push(`off grid: ${label(s)}`)
    if (workspace.unavailable.some(u => u.personId === s.personId && u.start < s.end && s.start < u.end)) problems.push(`person unavailable: ${label(s)}`)
  }

  // Rest between every pair involving a planned shift (history may break today's rules).
  for (const s of planned) {
    for (const other of [...fixed, ...planned]) {
      if (other === s || other.personId !== s.personId) continue
      const gap = Math.max(other.start - s.end, s.start - other.end)
      if (gap < minRest * MINUTE) problems.push(`rest ${gap / MINUTE} min between ${label(s)} and ${label(other)}`)
    }
  }

  // Every future covered minute needs exactly one person; uncovered minutes need none.
  const edges = new Set<number>([from])
  for (const x of [...workspace.coverage, ...fixed, ...planned]) edges.add(x.start).add(x.end)
  const times = [...edges].filter(t => t >= from).sort((a, b) => a - b)
  for (const position of workspace.positions) {
    for (let i = 0; i + 1 < times.length; i++) {
      const t = times[i]
      const needed = workspace.coverage.some(c => c.positionId === position.id && c.start <= t && t < c.end)
      const staffed = [...fixed, ...planned].filter(s => s.positionId === position.id && s.start <= t && t < s.end).length
      const at = new Date(t).toISOString()
      if (needed && staffed === 0) problems.push(`${position.id} uncovered at ${at}`)
      else if (staffed > 1) problems.push(`${position.id} double-staffed at ${at}`)
      else if (!needed && planned.some(s => s.positionId === position.id && s.start <= t && t < s.end)) problems.push(`${position.id} planned outside coverage at ${at}`)
    }
  }
  return problems
}
