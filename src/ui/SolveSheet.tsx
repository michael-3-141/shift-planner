import { useEffect, useState } from 'react'
import { activeConstraint } from '../engine/rules'
import { defaultTimeLimitSeconds, isPreferredHandover } from '../engine/solve'
import type { Workspace } from '../engine/types'
import { gridProblems, rulesProblem } from '../model/plan'
import { withinPeriod } from '../model/period'
import type { SetupStep } from '../model/setup'
import { addDays, formatDateTime, formatDay, formatHours, formatRange, fromInputValue, snap, toInputValue } from '../model/time'
import { t } from '../i18n'
import { Sheet } from './Sheet'
import type { SolveState } from './useSolver'

interface Props {
  workspace: Workspace
  state: SolveState
  now: number
  onStart: (from: number, seconds?: number) => void
  onCancel: () => void
  onAccept: () => void
  onDiscard: () => void
  onClose: () => void
  /** Leaves the panel for the place where a missing step is done. */
  onFix: (step: SetupStep) => void
}

export function SolveSheet({ workspace, state, now, onStart, onCancel, onAccept, onDiscard, onClose, onFix }: Props) {
  const step = workspace.rules.stepMinutes
  const [from, setFrom] = useState(() => toInputValue(snap(Math.max(now, workspace.period?.start ?? now), step, 'ceil')))
  const [seconds, setSeconds] = useState('')

  return (
    <Sheet title={t().plan.title} onClose={onClose}>
      {state.phase === 'idle' && (() => {
        const start = snap(fromInputValue(from), step)
        // What stops planning, each with where to fix it.
        const problems: { text: string; fix: SetupStep; action: string }[] = []
        if (!workspace.people.length) problems.push({ text: t().plan.noPeople, fix: 'people', action: t().common.goToTeam })
        if (!workspace.positions.length) problems.push({ text: t().plan.noPositions, fix: 'positions', action: t().common.goToTeam })
        if (workspace.period && start >= workspace.period.end) problems.push({ text: t().plan.afterDates(formatDay(addDays(workspace.period.end, -1))), fix: 'rules', action: t().plan.changeDates })
        else if (workspace.positions.length && !withinPeriod(workspace).coverage.some(c => c.end > start)) problems.push({ text: t().plan.noCoverage, fix: 'coverage', action: t().plan.addCoverage })
        const rules = rulesProblem(workspace)
        if (rules) problems.push({ text: rules, fix: 'rules', action: t().plan.fixRules })
        const offGrid = Number.isNaN(start) ? [] : gridProblems(workspace, start)
        return (
          <form className="form" onSubmit={e => { e.preventDefault(); onStart(start, seconds ? Number(seconds) : undefined) }}>
            <p className="hint">
              {workspace.period ? t().plan.replacesUntil(formatDay(addDays(workspace.period.end, -1))) : t().plan.replaces}
              {' '}{t().plan.keeps}
            </p>
            <div className="row">
              <label>{t().plan.from}<input type="datetime-local" required step={step * 60} value={from} onChange={e => setFrom(e.target.value)} /></label>
              <label>{t().plan.timeLimit}<input type="number" inputMode="numeric" min={5} max={600} value={seconds} placeholder={String(defaultTimeLimitSeconds(workspace.rules))} onChange={e => setSeconds(e.target.value)} /></label>
            </div>
            {problems.map(p => (
              <div key={p.text} className="problem">
                <p className="error">{p.text}</p>
                <button type="button" onClick={() => onFix(p.fix)}>{p.action}</button>
              </div>
            ))}
            {offGrid.length > 0 && (
              <div className="error">
                <p>{t().plan.offGrid(step)}</p>
                <ul>{offGrid.slice(0, 8).map(p => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            <div className="actions">
              <span className="spacer" />
              <button type="submit" className="primary" disabled={problems.length > 0 || offGrid.length > 0 || Number.isNaN(start)}>{t().plan.start}</button>
            </div>
          </form>
        )
      })()}

      {state.phase === 'running' && <Running state={state} aligning={!!activeConstraint(workspace.rules, 'preferredHandovers')} onCancel={onCancel} onClose={onClose} />}

      {state.phase === 'done' && (
        <div className="form">
          <Outcome workspace={workspace} state={state} />
          <div className="actions">
            {state.result?.shifts ? (
              <>
                <button className="danger" onClick={onDiscard}>{t().common.discard}</button>
                <span className="spacer" />
                <button onClick={onClose}>{t().plan.review}</button>
                <button className="primary" onClick={onAccept}>{t().plan.acceptPlan}</button>
              </>
            ) : (
              <>
                <span className="spacer" />
                <button className="primary" onClick={onDiscard}>{t().common.back}</button>
              </>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function Running({ state, aligning, onCancel, onClose }: { state: Extract<SolveState, { phase: 'running' }>; aligning: boolean; onCancel: () => void; onClose: () => void }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setElapsed((performance.now() - state.started) / 1000), 500)
    return () => clearInterval(timer)
  }, [state.started])
  const best = state.best === undefined ? t().plan.firstPlan
    : state.stage === 'balance' ? t().plan.highestSoFar(formatHours(state.best / 100))
    : aligning ? '' : t().plan.shiftsSoFar(state.best)
  return (
    <div className="form">
      <p><b>{t().plan.stages[state.stage === 'balance' ? 'balance' : aligning ? 'handovers' : 'shifts']}</b></p>
      <progress max={state.seconds} value={Math.min(elapsed, state.seconds)} />
      <p className="hint">{t().plan.elapsed(Math.floor(elapsed), state.seconds)} {best}</p>
      <p className="hint">{t().plan.keepsRunning}</p>
      <div className="actions">
        <button onClick={onCancel}>{t().plan.stop}</button>
        <span className="spacer" />
        <button className="primary" onClick={onClose}>{t().plan.hide}</button>
      </div>
    </div>
  )
}

function Outcome({ workspace, state }: { workspace: Workspace; state: Extract<SolveState, { phase: 'done' }> }) {
  const { result, error } = state
  if (error) return <p className="error">{t().plan.failed(error)}</p>
  if (!result) return null
  const position = new Map(workspace.positions.map(p => [p.id, p.name]))
  const preferences = activeConstraint(workspace.rules, 'preferredHandovers')
  switch (result.status) {
    case 'optimal':
    case 'feasible': {
      const handovers = result.shifts!.flatMap(s => [s.start, s.end])
      const preferred = handovers.filter(isPreferredHandover(preferences)).length
      return (
        <>
          <p><b>{t().plan.planned(result.shifts!.length)}</b>{t().plan.plannedFrom(formatDateTime(state.from))}</p>
          <p className="hint">
            {evenness(result.stats.evenGapMinutes ?? 0)}
            {preferences && ` ${t().plan.aligned(preferred, handovers.length)}`}
            {' '}{t().plan.shownDashed}
          </p>
        </>
      )
    }
    case 'infeasible':
      return result.uncoverable?.length ? (
        <div className="error">
          <p>{t().plan.uncoverable}</p>
          <ul>{result.uncoverable.slice(0, 12).map(u => <li key={`${u.positionId}${u.start}`}>{position.get(u.positionId)}: {formatRange(u.start, u.end)}</li>)}</ul>
        </div>
      ) : (
        <p className="error">{t().plan.infeasible}</p>
      )
    case 'unknown':
      return <p className="error">{t().plan.unknown}</p>
    case 'invalid':
      return <p className="error">{t().plan.invalid}</p>
  }
}

/** How close the busiest person's workload is to the best possible, which planning proves along the way. */
function evenness(gapMinutes: number) {
  if (gapMinutes <= 0) return t().plan.mostEven
  return t().plan.withinEven(formatHours(gapMinutes))
}
