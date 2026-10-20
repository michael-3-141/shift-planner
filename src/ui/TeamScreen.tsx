import { useState } from 'react'
import type { Workspace } from '../engine/types'
import type { Update } from '../model/storage'
import { newId, nextColor, removePerson, removePosition } from '../model/workspace'
import { t } from '../i18n'
import { Icon } from './Icon'

/** People and positions, edited in place. */
export function TeamScreen({ workspace, update }: { workspace: Workspace; update: Update }) {
  const { people, positions } = workspace
  const usedColors = (list: { color: string }[]) => list.map(x => x.color)
  return (
    <div className="page">
      <section>
        <h2>{t().team.people}</h2>
        <ul className="list">
          {people.map(person => {
            const count = workspace.shifts.filter(s => s.personId === person.id).length + workspace.unavailable.filter(u => u.personId === person.id).length
            const set = (change: Partial<typeof person>) => update(w => ({ ...w, people: w.people.map(p => (p.id === person.id ? { ...p, ...change } : p)) }))
            return (
              <li key={person.id}>
                <input type="color" aria-label={t().team.color} value={person.color} onChange={e => set({ color: e.target.value })} />
                <input dir="auto" aria-label={t().team.name} value={person.name} onChange={e => set({ name: e.target.value })} />
                <DeleteButton what={person.name} related={count} onDelete={() => update(w => removePerson(w, person.id))} />
              </li>
            )
          })}
        </ul>
        <button onClick={() => update(w => ({ ...w, people: [...w.people, { id: newId(), name: t().team.newPerson(w.people.length + 1), color: nextColor(usedColors(w.people)) }] }))}>
          <Icon name="plus" size={16} />{t().team.addPerson}
        </button>
      </section>

      <section>
        <h2>{t().team.positions}</h2>
        <p className="hint">{t().team.weightHint}</p>
        <ul className="list">
          {positions.map(position => {
            const count = workspace.shifts.filter(s => s.positionId === position.id).length + workspace.coverage.filter(c => c.positionId === position.id).length
            const set = (change: Partial<typeof position>) => update(w => ({ ...w, positions: w.positions.map(p => (p.id === position.id ? { ...p, ...change } : p)) }))
            return (
              <li key={position.id}>
                <input type="color" aria-label={t().team.color} value={position.color} onChange={e => set({ color: e.target.value })} />
                <input dir="auto" aria-label={t().team.name} value={position.name} onChange={e => set({ name: e.target.value })} />
                <WeightInput value={position.weight} onChange={weight => set({ weight })} />
                <DeleteButton what={position.name} related={count} onDelete={() => update(w => removePosition(w, position.id))} />
              </li>
            )
          })}
        </ul>
        <button onClick={() => update(w => ({ ...w, positions: [...w.positions, { id: newId(), name: t().team.newPosition(w.positions.length + 1), color: nextColor(usedColors(w.positions)), weight: 1 }] }))}>
          <Icon name="plus" size={16} />{t().team.addPosition}
        </button>
      </section>
    </div>
  )
}

/** Keeps what is typed, saving it only while it is a valid positive number. */
function WeightInput({ value, onChange }: { value: number; onChange: (weight: number) => void }) {
  const [text, setText] = useState(String(value))
  // Follow outside changes, such as an import, without disturbing what is being typed.
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    if (Number(text) !== value) setText(String(value))
  }
  const valid = Number(text) > 0
  return (
    <label className="weight">
      <span>{t().team.weight}</span>
      <input
        type="number" inputMode="decimal" min={0.1} step={0.1} value={text} aria-invalid={!valid}
        onChange={e => { setText(e.target.value); if (Number(e.target.value) > 0) onChange(Number(e.target.value)) }}
        onBlur={() => setText(String(value))}
      />
    </label>
  )
}

/** Asks once more when other data would go too. */
function DeleteButton({ what, related, onDelete }: { what: string; related: number; onDelete: () => void }) {
  const [asking, setAsking] = useState(false)
  if (asking) {
    return (
      <span className="confirm">
        <button className="danger" onClick={onDelete}>{related ? t().team.deleteWith(related) : t().common.delete}</button>
        <button onClick={() => setAsking(false)}>{t().common.keep}</button>
      </span>
    )
  }
  return <button className="icon" aria-label={t().team.deleteWhat(what)} onClick={() => (related ? setAsking(true) : onDelete())}><Icon name="trash" /></button>
}
