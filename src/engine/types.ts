import type { CpSatSolverParameters } from 'or-tools-wasm/cp-sat'

// All times are epoch milliseconds (UTC). Durations are minutes.

export type Id = string

export interface Person {
  id: Id
  name: string
  color: string
}

export interface Position {
  id: Id
  name: string
  color: string
  /** Relative workload per hour, e.g. 1.5 for a position that is 1.5x as hard. */
  weight: number
}

export interface Interval {
  start: number
  end: number
}

/** A block of time during which a position needs exactly one person. */
export interface Coverage extends Interval {
  id: Id
  positionId: Id
  /** Blocks created by one repeat share this, so they can be edited together. The engine ignores it. */
  seriesId?: Id
}

export interface Unavailable extends Interval {
  id: Id
  personId: Id
  note?: string
}

/** Fixed shifts are history (in the past) or pins (in the future). */
export interface Shift extends Interval {
  id: Id
  personId: Id
  positionId: Id
  fixed: boolean
}

export interface Rules {
  /** The planning grid: shifts start and end on multiples of this from midnight. */
  stepMinutes: number
  /** At most one of each kind; maxShift and minRest are required and always enabled. */
  constraints: Constraint[]
}

/** Every constraint can be switched off without losing its settings. */
export type Constraint = MaxShift | MinRest | PreferredHandovers
export type ConstraintKind = Constraint['kind']

/** Shifts last at most this long. */
export interface MaxShift {
  kind: 'maxShift'
  enabled: boolean
  minutes: number
}

/** A person has at least this long off between two shifts. */
export interface MinRest {
  kind: 'minRest'
  enabled: boolean
  minutes: number
}

/** Shifts preferably start and end at these local clock times: firstMinutes after midnight, then every everyMinutes. */
export interface PreferredHandovers {
  kind: 'preferredHandovers'
  enabled: boolean
  /** Divides a day, so the times repeat daily. */
  everyMinutes: number
  firstMinutes: number
  /** How far the highest weighted workload may rise above the most even plan found, to align handovers. */
  allowedExtraMinutes: number
}

export interface Workspace {
  people: Person[]
  positions: Position[]
  coverage: Coverage[]
  unavailable: Unavailable[]
  shifts: Shift[]
  rules: Rules
  /**
   * The dates the workspace is about, from midnight to midnight; unlimited when absent.
   * The app clips everything to it before solving, so the engine never reads it.
   */
  period?: Interval
}

export interface SolveOptions {
  /** Plan coverage from this instant on. Must lie on the step grid. */
  from: number
  /** Total seconds for both solve stages; defaults by the rules (see defaultTimeLimitSeconds). */
  timeLimitSeconds?: number
  numWorkers?: number
  signal?: AbortSignal
  onProgress?: (progress: SolveProgress) => void
  /** Receives the CP-SAT search log when set. */
  onLog?: (message: string) => void
  /** Extra CP-SAT parameters, for tuning. */
  parameters?: CpSatSolverParameters
}

export type Stage = 'balance' | 'shifts'

export interface SolveProgress {
  stage: Stage
  objective?: number
  bound?: number
}

export type SolveStatus = 'optimal' | 'feasible' | 'infeasible' | 'unknown' | 'invalid'

/** A stretch of a position that nobody can work under availability and rest. */
export interface Uncoverable extends Interval {
  positionId: Id
}

export interface PersonTotals {
  fixedMinutes: number
  plannedMinutes: number
  /** Minutes multiplied by position weight, fixed and planned together. */
  load: number
  plannedShifts: number
}

export interface SolveResult {
  status: SolveStatus
  /** New non-fixed shifts; absent unless status is optimal or feasible. */
  shifts?: Shift[]
  totals?: Record<Id, PersonTotals>
  uncoverable?: Uncoverable[]
  stats: {
    candidates: number
    stages: { stage: Stage; status: string; seconds: number; firstSolutionSeconds: number | null; objective: number | null; bound: number | null }[]
    /** How far the busiest weighted workload is above the proven best possible, in minutes; set with a plan. */
    evenGapMinutes?: number
  }
}
