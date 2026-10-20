import { CpModel, CpResult, CpSat, LinearExpr, type BoolVar, type CpSatSolverParameters, type CpSolverResponse, type IntVar } from 'or-tools-wasm/cp-sat'
import { activeConstraint, requiredConstraint } from './rules'
import type { Id, Interval, PersonTotals, PreferredHandovers, Rules, Shift, SolveOptions, SolveResult, SolveStatus, Stage, Uncoverable, Workspace } from './types'

const MINUTE = 60_000

/** Position weights are scaled to integers so loads stay exact. */
const scaledWeight = (weight: number) => Math.round(weight * 100)

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

/** Finer grids give the solver much more to search, so they get more time by default. */
// Moving handovers to preferred times needs real search in stage 2; measured on the example week, 30 s aligned
// 60–70% of them and 90 s 80–90%.
export const defaultTimeLimitSeconds = (rules: Rules) =>
  activeConstraint(rules, 'preferredHandovers')
    ? (rules.stepMinutes >= 60 ? 90 : 120)
    : rules.stepMinutes >= 60 ? 30 : rules.stepMinutes >= 30 ? 60 : 120

/**
 * Plan the non-fixed future.
 * Time is cut into slots of `stepMinutes`. The model has one Boolean per (person, position, slot) saying
 * whether that person works that position during that slot; a shift is a run of consecutive working slots.
 */
export async function solve(workspace: Workspace, options: SolveOptions): Promise<SolveResult> {
  const { people, positions, rules } = workspace
  const step = rules.stepMinutes * MINUTE
  const from = options.from
  const maxShift = requiredConstraint(rules, 'maxShift').minutes
  const minRest = requiredConstraint(rules, 'minRest').minutes
  const handovers = activeConstraint(rules, 'preferredHandovers')
  const maxLength = Math.floor(maxShift / rules.stepMinutes)
  const restSlots = Math.ceil(minRest / rules.stepMinutes)
  const rest = minRest * MINUTE
  if (maxLength < 1) throw new Error('Maximum shift length is shorter than one step')
  // Zero rest would just be a longer maximum shift; the capacity window below also relies on rest > 0.
  if (restSlots < 1) throw new Error('Minimum rest must be more than zero')
  const toSlot = (t: number) => {
    if ((t - from) % step !== 0) throw new Error(`${new Date(t).toISOString()} is not on the ${rules.stepMinutes}-minute grid`)
    return (t - from) / step
  }
  const slotTime = (slot: number) => from + slot * step
  const slotInterval = (slot: number) => ({ start: slotTime(slot), end: slotTime(slot + 1) })

  const fixed = workspace.shifts.filter(s => s.fixed)
  const weights = new Map(positions.map(p => [p.id, scaledWeight(p.weight)]))

  // Required slots per position: future coverage minus whatever fixed shifts already cover.
  const horizon = Math.max(0, ...workspace.coverage.filter(c => c.end > from).map(c => toSlot(c.end)))
  const required = new Map(positions.map(p => [p.id, new Array<boolean>(horizon).fill(false)]))
  for (const c of workspace.coverage) {
    if (c.end <= from) continue
    const slots = required.get(c.positionId)!
    for (let t = toSlot(Math.max(c.start, from)); t < toSlot(c.end); t++) slots[t] = true
  }
  for (const s of fixed) {
    const slots = required.get(s.positionId)!
    for (let t = 0; t < horizon; t++) if (overlaps(s, slotInterval(t))) slots[t] = false
  }

  // A slot is open to a person if it avoids their unavailability and keeps rest around their fixed shifts.
  // Checking each slot is enough: a shift keeps rest iff its first and last slots do.
  const open = (personId: Id, slot: Interval) =>
    !workspace.unavailable.some(u => u.personId === personId && overlaps(u, slot)) &&
    !fixed.some(f => f.personId === personId && slot.start < f.end + rest && f.start < slot.end + rest)

  const model = new CpModel()
  // works[person][position][slot], undefined where that assignment is impossible.
  const works = new Map(people.map(person => [person.id, new Map(positions.map(position => {
    const slots = required.get(position.id)!
    return [position.id, slots.map((needed, t) => needed && open(person.id, slotInterval(t)) ? model.newBoolVar() : undefined)]
  }))]))
  const all = [...works.values()].flatMap(byPosition => [...byPosition.values()].flat()).filter(x => x !== undefined)

  // Required slots nobody can take, merged into readable intervals.
  const uncoverable: Uncoverable[] = []
  for (const [positionId, slots] of required) {
    let last: Uncoverable | undefined
    slots.forEach((needed, t) => {
      if (!needed || people.some(p => works.get(p.id)!.get(positionId)![t])) return
      if (last && last.end === slotTime(t)) last.end = slotTime(t + 1)
      else uncoverable.push(last = { positionId, ...slotInterval(t) })
    })
  }
  const stats: SolveResult['stats'] = { candidates: all.length, stages: [] }
  if (uncoverable.length) return { status: 'infeasible', uncoverable, stats }

  // Exactly one person on each required slot.
  for (const [positionId, slots] of required) {
    slots.forEach((needed, t) => needed && model.addExactlyOne(people.flatMap(p => works.get(p.id)!.get(positionId)![t] ?? [])))
  }

  const shiftStarts: BoolVar[] = []
  const offPreferred: BoolVar[] = []
  const preferred = isPreferredHandover(handovers)
  for (const person of people) {
    const byPosition = [...works.get(person.id)!.values()]
    // busy[t]: the person works some position in slot t (at most one at a time).
    const busy: (BoolVar | undefined)[] = Array.from({ length: horizon }, (_, t) => {
      const here = byPosition.map(slots => slots[t]).filter(x => x !== undefined)
      if (here.length <= 1) return here[0]
      const b = model.newBoolVar()
      model.addLinearConstraint(LinearExpr.weightedSum([...here, b], [...here.map(() => 1), -1]), 0, 0)
      return b
    })
    for (let t = 0; t < horizon; t++) {
      const now = busy[t]
      if (!now) continue
      // Shift length: no more than maxLength busy slots in any maxLength + restSlots consecutive slots.
      // (maxLength + 1 would suffice with the rest clauses; the wider window is valid and lets the solver
      // see each person's capacity, which matters when coverage is tight.)
      const window = busy.slice(t, t + maxLength + restSlots).filter(x => x !== undefined)
      if (window.length > maxLength) model.addLinearConstraint(LinearExpr.sum(window), 0, maxLength)
      // Rest: if a shift ends after slot t, the next restSlots slots are free.
      const next = busy[t + 1]
      for (let k = 2; k <= restSlots; k++) {
        const later = busy[t + k]
        if (later) model.addBoolOr(next ? [now.not(), next, later.not()] : [now.not(), later.not()])
      }
    }
    for (let a = 0; a < byPosition.length; a++) {
      const slots = byPosition[a]
      for (let t = 0; t < horizon; t++) {
        const x = slots[t]
        if (!x) continue
        // No switching position without a break; the switch would be one shift with no rest.
        for (let b = 0; b < byPosition.length; b++) {
          const y = byPosition[b][t + 1]
          if (b !== a && y) model.addAtMostOne([x, y])
        }
        // Count shift starts so stage 2 can prefer fewer, longer shifts.
        const before = slots[t - 1]
        let start = x
        if (before) {
          start = model.newBoolVar()
          model.addBoolOr([x.not(), before, start])
        }
        shiftStarts.push(start)
        // Count starts and ends away from the preferred handover times, which stage 2 avoids.
        if (!preferred(slotTime(t))) offPreferred.push(start)
        if (!preferred(slotTime(t + 1))) {
          const after = slots[t + 1]
          let end = x
          if (after) {
            end = model.newBoolVar()
            model.addBoolOr([x.not(), after, end])
          }
          offPreferred.push(end)
        }
      }
    }
  }

  const fixedMinutes = new Map(people.map(p => [p.id, 0]))
  const fixedLoad = new Map(people.map(p => [p.id, 0]))
  for (const s of fixed) {
    const minutes = (s.end - s.start) / MINUTE
    fixedMinutes.set(s.personId, (fixedMinutes.get(s.personId) ?? 0) + minutes)
    fixedLoad.set(s.personId, (fixedLoad.get(s.personId) ?? 0) + minutes * weights.get(s.positionId)!)
  }
  const loadBound = Math.ceil(Math.max(...fixedLoad.values()) + horizon * rules.stepMinutes * positions.length * Math.max(...weights.values()))
  const loads: IntVar[] = people.map(person => {
    const load = model.newIntVar(0, loadBound, `load_${person.id}`)
    const vars: BoolVar[] = []
    const coeffs: number[] = []
    for (const [positionId, slots] of works.get(person.id)!) {
      for (const x of slots) if (x) { vars.push(x); coeffs.push(-rules.stepMinutes * weights.get(positionId)!) }
    }
    // load - planned = fixed (fixed loads can be fractional for off-grid history, so round them).
    const fixedValue = Math.round(fixedLoad.get(person.id)!)
    model.addLinearConstraint(LinearExpr.weightedSum([load, ...vars], [1, ...coeffs]), fixedValue, fixedValue)
    return load
  })
  // Fairness is the highest load: minimizing it evens everyone out, and unlike (max - min) it is not
  // held hostage by someone whose load can't rise, e.g. because they were away.
  const high = model.newIntVar(0, loadBound, 'high')
  model.addMaxEquality(high, loads)

  const budget = options.timeLimitSeconds ?? defaultTimeLimitSeconds(rules)
  const run = async (stage: Stage, seconds: number, parameters: CpSatSolverParameters, stopWhenStalled: boolean): Promise<CpResult> => {
    const started = performance.now()
    let firstSolution: number | null = null
    // Stopping a solve discards its result, so the latest solution is kept from the live events instead.
    let latest: CpSolverResponse | undefined
    let improved = started
    const stop = new AbortController()
    const forward = () => stop.abort()
    options.signal?.addEventListener('abort', forward)
    if (options.signal?.aborted) stop.abort()
    // Stop once the plan hasn't improved for a while: STALL_SECONDS, or a third of the time so far.
    const watch = stopWhenStalled && setInterval(() => {
      const now = performance.now()
      if (latest && now - improved > Math.max(STALL_SECONDS * 1000, (now - started) / 3)) stop.abort()
    }, 250)
    let result: CpResult
    try {
      result = await CpSat.solve(model, {
        ...parameters,
        ...options.parameters,
        maxTimeInSeconds: Math.max(1, seconds),
        numWorkers: options.numWorkers ?? 8,
        signal: stop.signal,
        // The log is always on: its timestamps are the solver's own, while events may arrive late.
        logSearchProgress: true,
        eventMask: { solution: true, bestBound: true, log: true },
        onEvent: event => {
          if (event.type === 'solution') {
            latest = event.response
            improved = performance.now()
            options.onProgress?.({ stage, objective: event.response.objectiveValue })
          } else if (event.type === 'bestBound') options.onProgress?.({ stage, bound: event.bound })
          else if (event.type === 'log') {
            const first = /^#1\s+([\d.]+)s/.exec(event.message)
            if (first) firstSolution ??= Number(first[1])
            options.onLog?.(event.message)
          }
        },
      })
    } catch (error) {
      // Stopped by us or by the caller: carry on with the best plan so far, if there is one.
      if (!stop.signal.aborted || !latest) throw error
      result = new CpResult(model, latest, model.modelProto.variables?.length ?? 0)
    } finally {
      if (watch) clearInterval(watch)
      options.signal?.removeEventListener('abort', forward)
    }
    stats.stages.push({
      stage, status: stop.signal.aborted ? 'STOPPED' : String(result.status), seconds: (performance.now() - started) / 1000, firstSolutionSeconds: firstSolution,
      objective: result.hasSolution ? result.objectiveValue : null, bound: result.bestObjectiveBound,
    })
    return result
  }

  // Stage 1: balance weighted workload. Stage 2: keep that balance (plus the allowance for aligned
  // handovers), put handovers at the preferred times where possible, then use as few shifts as possible.
  // Stage 1 gets most of the budget; stage 2 starts from its plan and gets whatever is left.
  // Stage 1's lower bound is nearly exact, so it stops once its plan is provably within EVEN_ENOUGH of the
  // best possible. Stage 2's bound is weak (it rarely proves anything), so it stops when it stops improving.
  const started = performance.now()
  model.minimize(high)
  const balance = await run('balance', budget * 0.75, { absoluteGapLimit: EVEN_ENOUGH_MINUTES * scaledWeight(1) }, false)
  if (!balance.hasSolution) return { status: statusOf(balance), stats }
  const bound = balance.bestObjectiveBound ?? 0
  // Aligning handovers may cost some evenness, up to the allowance.
  const allowance = Math.round((handovers?.allowedExtraMinutes ?? 0) * scaledWeight(1))
  model.addLinearConstraint(high, 0, Number(balance.value(high)) + allowance)
  for (const x of all) model.addHint(x, balance.booleanValue(x))
  // Loads are in weighted minutes x 100, so HOUR_OF_LOAD is one hour at weight 1. Within the allowance, a
  // misplaced handover weighs as much as ten hours of extra workload and an extra shift as much as one.
  model.minimize(LinearExpr.weightedSum(
    [...offPreferred, ...shiftStarts, high],
    [...offPreferred.map(() => OFF_PREFERRED_COST * HOUR_OF_LOAD), ...shiftStarts.map(() => HOUR_OF_LOAD), 1],
  ))
  // A caller's stop during stage 1 keeps stage 1's plan.
  const fewest = options.signal?.aborted ? balance : await run('shifts', budget - (performance.now() - started) / 1000, {}, true)
  const final = fewest.hasSolution ? fewest : balance

  // Turn runs of working slots back into shifts.
  const shifts: Shift[] = []
  for (const person of people) {
    for (const [positionId, slots] of works.get(person.id)!) {
      let startSlot = -1
      for (let t = 0; t <= horizon; t++) {
        const on = !!slots[t] && final.booleanValue(slots[t]!)
        if (on && startSlot < 0) startSlot = t
        if (!on && startSlot >= 0) {
          shifts.push({ id: `planned-${shifts.length}`, personId: person.id, positionId, start: slotTime(startSlot), end: slotTime(t), fixed: false })
          startSlot = -1
        }
      }
    }
  }
  shifts.sort((a, b) => a.start - b.start || a.positionId.localeCompare(b.positionId))

  const totals: Record<Id, PersonTotals> = {}
  people.forEach((person, i) => {
    const own = shifts.filter(s => s.personId === person.id)
    totals[person.id] = {
      fixedMinutes: fixedMinutes.get(person.id)!,
      plannedMinutes: own.reduce((sum, s) => sum + (s.end - s.start) / MINUTE, 0),
      load: Number(final.value(loads[i])) / 100,
      plannedShifts: own.length,
    }
  })
  // Stage 2 only reaches 'optimal' if stage 1 proved its balance optimal too.
  // CP-SAT calls a plan within the gap limit optimal, so stage 1 counts as optimal only when it met its bound.
  const status = balance.objectiveValue === bound && statusOf(final) === 'optimal' ? 'optimal' : 'feasible'
  stats.evenGapMinutes = (Number(final.value(high)) - bound) / scaledWeight(1)
  return { status, shifts, totals, stats }
}

const OFF_PREFERRED_COST = 10
/** Stage 1 stops once the busiest workload is provably within this many weighted minutes of the best possible. */
const EVEN_ENOUGH_MINUTES = 30
/** Stage 2 stops after this long without a better plan (or a third of its time so far, if longer). */
const STALL_SECONDS = 10
const HOUR_OF_LOAD = 60 * scaledWeight(1)

/**
 * Whether a handover at t is at a preferred time; always true without preferences.
 * Preferred times are local clock times, so this reads the browser's time zone.
 */
export function isPreferredHandover(preferences?: Pick<PreferredHandovers, 'everyMinutes' | 'firstMinutes'>) {
  if (!preferences) return () => true
  const { everyMinutes, firstMinutes } = preferences
  return (t: number) => {
    const d = new Date(t)
    const minutes = d.getHours() * 60 + d.getMinutes()
    return (((minutes - firstMinutes) % everyMinutes) + everyMinutes) % everyMinutes === 0
  }
}

function statusOf(result: CpResult): SolveStatus {
  switch (String(result.status)) {
    case 'OPTIMAL': case '4': return 'optimal'
    case 'FEASIBLE': case '2': return 'feasible'
    case 'INFEASIBLE': case '3': return 'infeasible'
    case 'MODEL_INVALID': case '1': return 'invalid'
    default: return 'unknown'
  }
}
