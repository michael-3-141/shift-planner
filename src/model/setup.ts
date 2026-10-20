import type { Workspace } from '../engine/types'
import { withinPeriod } from './period'
import { rulesProblem } from './plan'

// The steps from an empty workspace to a plan, in the order they are best done: the step size decides
// where coverage can start and end, so rules come before coverage.

export type SetupStep = 'rules' | 'people' | 'positions' | 'coverage' | 'plan'

export const SETUP_STEPS: SetupStep[] = ['rules', 'people', 'positions', 'coverage', 'plan']

/** Which steps are done, judged by what the workspace holds from now on, inside its dates. */
export function setupDone(workspace: Workspace, now: number): Record<SetupStep, boolean> {
  const inside = withinPeriod(workspace)
  return {
    rules: !rulesProblem(workspace),
    people: workspace.people.length > 0,
    positions: workspace.positions.length > 0,
    coverage: inside.coverage.some(c => c.end > now),
    plan: inside.shifts.some(s => s.end > now),
  }
}
