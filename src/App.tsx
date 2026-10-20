import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Shift } from './engine/types'
import { acceptPlan, keptShifts } from './model/plan'
import { SETUP_STEPS, setupDone, type SetupStep } from './model/setup'
import { useStoredWorkspace } from './model/storage'
import { t } from './i18n'
import { getDisplayVersion, subscribeDisplay } from './i18n/locale'
import { MINUTE, startOfDay } from './model/time'
import { ScheduleScreen, type ScheduleView } from './ui/ScheduleScreen'
import { ExportSheet } from './ui/Export'
import { SettingsScreen } from './ui/SettingsScreen'
import { SolveSheet } from './ui/SolveSheet'
import { TeamScreen } from './ui/TeamScreen'
import { TotalsScreen } from './ui/TotalsScreen'
import { Icon, type IconName } from './ui/Icon'
import { useSolver } from './ui/useSolver'
import './App.css'

type Screen = 'schedule' | 'totals' | 'team' | 'settings'

const SCREENS: { id: Screen; icon: IconName }[] = [
  { id: 'schedule', icon: 'calendar' },
  { id: 'totals', icon: 'totals' },
  { id: 'team', icon: 'team' },
  { id: 'settings', icon: 'settings' },
]

const WIDE = '(min-width: 900px)'
const useWide = () => useSyncExternalStore(
  onChange => {
    const query = matchMedia(WIDE)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  },
  () => matchMedia(WIDE).matches,
)

/** The current time, refreshed every minute. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE)
    return () => clearInterval(timer)
  }, [])
  return now
}

export default function App() {
  const [workspace, update, storageError] = useStoredWorkspace()
  const [screen, setScreen] = useState<Screen>('schedule')
  const [planning, setPlanning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [view, setView] = useState<ScheduleView>(() => ({ day: startOfDay(Date.now()), mode: 'shifts' }))
  // The setup checklist can be hidden; it comes back when a step it showed as done is undone again.
  const [setupHiddenAt, setSetupHiddenAt] = useState<number>()
  const solver = useSolver()
  const now = useNow()
  const wide = useWide()
  // Text and times are produced in place everywhere, so a new language or clock re-renders the whole app.
  useSyncExternalStore(subscribeDisplay, getDisplayVersion)

  if (!workspace) return null

  const { state } = solver
  const draft = state.phase === 'done' ? state.result?.shifts : undefined
  const shifts: Shift[] = draft && state.phase === 'done'
    ? [...keptShifts(workspace, state.from), ...draft]
    : workspace.shifts
  const draftIds = new Set(draft?.map(s => s.id))
  const uncoverable = (state.phase === 'done' && state.result?.uncoverable) || []

  const accept = () => {
    if (state.phase === 'done' && draft) update(w => acceptPlan(w, state.from, draft))
    solver.clear()
    setPlanning(false)
  }
  const discard = () => {
    solver.clear()
    setPlanning(false)
  }
  // From the plan panel to whatever is missing.
  const fix = (step: SetupStep) => {
    setPlanning(false)
    if (step === 'rules') setScreen('settings')
    else if (step === 'people' || step === 'positions') setScreen('team')
    else {
      setScreen('schedule')
      setView(v => ({ ...v, mode: 'coverage' }))
    }
  }

  // A drafted plan counts as planned, so the checklist steps aside as soon as there is one to review.
  const done = setupDone({ ...workspace, shifts }, now)
  const doneCount = SETUP_STEPS.filter(s => done[s]).length
  const showSetup = doneCount < SETUP_STEPS.length && (setupHiddenAt === undefined || doneCount < setupHiddenAt)
  const setup = showSetup ? { done, onDismiss: () => setSetupHiddenAt(doneCount) } : undefined

  return (
    <div className={`app${wide ? ' wide' : ''}`}>
      <header className="top">
        <div className="brand">
          <span className="logo"><Icon name="calendar" size={16} /></span>
          <h1>{t().app.title}</h1>
        </div>
        {wide && (
          <nav className="tabs">
            {SCREENS.map(s => (
              <button key={s.id} aria-current={screen === s.id ? 'page' : undefined} onClick={() => setScreen(s.id)}>
                <Icon name={s.icon} size={16} />{t().app.tabs[s.id]}
              </button>
            ))}
          </nav>
        )}
        <span className="spacer" />
        <button className="icon" aria-label={t().export.button} title={t().export.button} onClick={() => setExporting(true)}><Icon name="download" /></button>
        <button className={`primary plan${state.phase === 'running' ? ' busy' : ''}`} onClick={() => setPlanning(true)}>
          <Icon name="sparkles" size={16} />
          {state.phase === 'running' ? t().app.planning : draft ? t().app.reviewPlan : t().app.plan}
        </button>
      </header>

      {storageError && <p className="banner error" role="alert">{storageError}</p>}
      {draft && (
        <div className="banner draft" role="status">
          <span>{t().app.draft(draft.length)}</span>
          <span className="spacer" />
          <button onClick={discard}>{t().common.discard}</button>
          <button className="primary" onClick={accept}>{t().common.accept}</button>
        </div>
      )}

      <main>
        {screen === 'schedule' && (
          <ScheduleScreen workspace={workspace} update={update} now={now} wide={wide} shifts={shifts} draftIds={draftIds} uncoverable={uncoverable} onGoTo={setScreen} onPlan={() => setPlanning(true)} setup={setup} view={view} setView={setView} />
        )}
        {screen === 'totals' && <TotalsScreen workspace={workspace} shifts={shifts} now={now} draft={!!draft} />}
        {screen === 'team' && <TeamScreen workspace={workspace} update={update} />}
        {screen === 'settings' && <SettingsScreen workspace={workspace} update={update} now={now} />}
      </main>

      {!wide && (
        <nav className="bottom-tabs">
          {SCREENS.map(s => (
            <button key={s.id} aria-current={screen === s.id ? 'page' : undefined} onClick={() => setScreen(s.id)}>
              <Icon name={s.icon} size={22} />{t().app.tabs[s.id]}
            </button>
          ))}
        </nav>
      )}

      {exporting && <ExportSheet workspace={workspace} day={view.day} hasDraft={!!draft} onClose={() => setExporting(false)} />}

      {planning && (
        <SolveSheet
          workspace={workspace} state={state} now={now}
          onStart={(from, seconds) => solver.start(workspace, from, seconds)}
          onCancel={solver.cancel} onAccept={accept} onDiscard={discard} onClose={() => setPlanning(false)} onFix={fix}
        />
      )}
    </div>
  )
}
