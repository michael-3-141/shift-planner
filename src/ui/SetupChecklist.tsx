import { useState } from 'react'
import type { Workspace } from '../engine/types'
import { requiredConstraint } from '../engine/rules'
import { withinPeriod } from '../model/period'
import { rulesProblem } from '../model/plan'
import { SETUP_STEPS, type SetupStep } from '../model/setup'
import { addDays, formatDay } from '../model/time'
import { t } from '../i18n'
import { Icon } from './Icon'

/** One line about each step: what is there when done, what to do when not. */
function detail(step: SetupStep, done: boolean, workspace: Workspace, now: number): string {
  const { rules, period } = workspace
  const inside = withinPeriod(workspace)
  const m = t().setup
  switch (step) {
    case 'rules': {
      if (!done) return rulesProblem(workspace)!
      const dates = period ? t().common.range(formatDay(period.start), formatDay(addDays(period.end, -1))) : m.noDateLimit
      return m.rulesSummary(dates, m.stepSize(rules.stepMinutes), requiredConstraint(rules, 'maxShift').minutes / 60, requiredConstraint(rules, 'minRest').minutes / 60)
    }
    case 'people':
      return done ? m.people(workspace.people.length) : m.peopleTodo
    case 'positions':
      return done ? workspace.positions.map(p => p.name).join(', ') : m.positionsTodo
    case 'coverage':
      return done ? m.coverage(inside.coverage.filter(c => c.end > now).length) : m.coverageTodo
    case 'plan':
      return done ? m.plan(inside.shifts.filter(s => s.end > now).length) : m.planTodo
  }
}

interface Props {
  workspace: Workspace
  now: number
  done: Record<SetupStep, boolean>
  onAction: (step: SetupStep) => void
  onDismiss: () => void
  /** Start folded to the next step. */
  compact: boolean
}

export function SetupChecklist({ workspace, now, done, compact, onAction, onDismiss }: Props) {
  // On phones only the next step shows until the list is opened, so the schedule keeps its room.
  const [open, setOpen] = useState(!compact)
  const count = SETUP_STEPS.filter(s => done[s]).length
  const next = SETUP_STEPS.find(s => !done[s])
  // Planning needs everything before it.
  const blocked = (step: SetupStep) => (step === 'coverage' && !done.positions) || (step === 'plan' && SETUP_STEPS.slice(0, 4).some(s => !done[s]))
  return (
    <section className="setup" aria-label={t().setup.title}>
      <header>
        <button className="setup-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <b>{t().setup.title}</b>
          <span className="count">{t().setup.progress(count, SETUP_STEPS.length)}</span>
          <span className="chevron"><Icon name={open ? 'up' : 'down'} size={16} /></span>
        </button>
        <button className="icon" aria-label={t().setup.hide} onClick={onDismiss}><Icon name="close" size={16} /></button>
      </header>
      {(open || next) && (
        <ol>
          {SETUP_STEPS.filter(step => open || step === next).map(step => (
            <li key={step} className={done[step] ? 'done' : step === next ? 'next' : undefined}>
              <span className="status" aria-label={done[step] ? t().setup.done : t().setup.toDo}>{done[step] && <Icon name="check" size={14} />}</span>
              <div className="text">
                <b>{t().setup.steps[step]}</b>
                <span dir="auto">{detail(step, done[step], workspace, now)}</span>
              </div>
              <button className={step === next ? 'primary' : undefined} disabled={blocked(step)} onClick={() => onAction(step)}>
                {step === 'plan' ? t().app.plan : done[step] ? t().common.edit : step === 'rules' ? t().setup.fix : t().common.add}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
