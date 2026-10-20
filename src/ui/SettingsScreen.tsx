import { useRef, useState } from 'react'
import type { Workspace } from '../engine/types'
import type { Update } from '../model/storage'
import { t } from '../i18n'
import { getHourCycle, getLanguageChoice, setHourCycle, setLanguageChoice, type HourCycle, type LanguageChoice } from '../i18n/locale'
import { toInputValue } from '../model/time'
import { emptyWorkspace, parseWorkspace, serializeWorkspace } from '../model/workspace'
import { Icon } from './Icon'
import { RulesSection, WorkspaceSection } from './PlanningSettings'
import { loadTheme, setTheme, type ThemeChoice } from './theme'

export function SettingsScreen({ workspace, update, now }: { workspace: Workspace; update: Update; now: number }) {
  return (
    <div className="page">
      <WorkspaceSection workspace={workspace} update={update} now={now} />
      <RulesSection workspace={workspace} update={update} />
      <DataSection workspace={workspace} update={update} now={now} />
      <AppearanceSection />
      <section>
        <h2>{t().settings.device}</h2>
        <p className="hint">
          {crossOriginIsolated ? t().settings.threads(Math.min(8, navigator.hardwareConcurrency || 4)) : t().settings.oneThread}
          {' '}{t().settings.localData}
        </p>
      </section>
    </div>
  )
}

const THEMES: ThemeChoice[] = ['system', 'light', 'dark']
const HOUR_CYCLES: HourCycle[] = ['auto', '24', '12']
const LANGUAGES: LanguageChoice[] = ['auto', 'en', 'he']

/** A labelled one-of-a-few choice. */
function Choice<T extends string>({ label, options, value, names, onChange }: { label: string; options: T[]; value: T; names: Record<T, string>; onChange: (value: T) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(o => <button key={o} role="radio" aria-checked={value === o} onClick={() => onChange(o)}>{names[o]}</button>)}
      </div>
    </div>
  )
}

function AppearanceSection() {
  const [theme, setChoice] = useState(loadTheme)
  const m = t().settings
  // The app re-renders when the language or clock changes, so those can be read directly.
  return (
    <section>
      <h2>{m.appearance}</h2>
      <div className="form">
        <Choice label={m.language} options={LANGUAGES} value={getLanguageChoice()} names={m.languages} onChange={setLanguageChoice} />
        <Choice label={m.theme} options={THEMES} value={theme} names={m.themes} onChange={c => { setTheme(c); setChoice(c) }} />
        <Choice label={m.clock} options={HOUR_CYCLES} value={getHourCycle()} names={m.clocks} onChange={setHourCycle} />
      </div>
    </section>
  )
}

function DataSection({ workspace, update, now }: { workspace: Workspace; update: Update; now: number }) {
  const file = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string>()
  // A destructive change waiting for confirmation.
  const [pending, setPending] = useState<{ question: string; action: string; done: string; change: (w: Workspace) => Workspace }>()
  const replaceWith = (what: string, replacement: Workspace) => setPending({
    question: t().settings.replaceWith(what),
    action: t().settings.replace, done: t().settings.replacedWith(what), change: () => replacement,
  })
  const shifts = workspace.shifts.length

  const download = () => {
    const url = URL.createObjectURL(new Blob([serializeWorkspace(workspace)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `shift-planner-${toInputValue(now).slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const read = async (f: File) => {
    try {
      replaceWith(t().settings.fileData(f.name), parseWorkspace(await f.text()))
      setMessage(undefined)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }
  const confirm = () => {
    update(pending!.change)
    setMessage(pending!.done)
    setPending(undefined)
  }

  return (
    <section>
      <h2>{t().settings.data}</h2>
      <div className="group">
        <h3>{t().settings.backup}</h3>
        <div className="buttons">
          <button onClick={download}><Icon name="download" size={16} />{t().settings.export}</button>
          <button onClick={() => file.current!.click()}><Icon name="upload" size={16} />{t().settings.import}</button>
        </div>
      </div>
      <div className="group">
        <h3>{t().settings.reset}</h3>
        <div className="buttons">
          <button
            className="danger" disabled={!shifts}
            onClick={() => setPending({
              question: t().settings.clearQuestion(shifts, !!workspace.period),
              action: t().settings.clearShifts, done: t().settings.cleared(shifts), change: w => ({ ...w, shifts: [] }),
            })}
          >
            {t().settings.clearShifts}
          </button>
          <button className="danger" onClick={() => replaceWith(t().settings.emptyWorkspace, emptyWorkspace())}>{t().settings.eraseEverything}</button>
        </div>
      </div>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => { if (e.target.files?.[0]) read(e.target.files[0]); e.target.value = '' }} />
      {pending && (
        <div className="confirm-box" role="alert">
          <p>{pending.question}</p>
          <div className="actions">
            <span className="spacer" />
            <button onClick={() => setPending(undefined)}>{t().common.cancel}</button>
            <button className="danger" onClick={confirm}>{pending.action}</button>
          </div>
        </div>
      )}
      {message && <p className="hint" role="status">{message}</p>}
    </section>
  )
}
