import type { Shift, Workspace } from '../engine/types'
import { t } from '../i18n'
import { totals } from '../model/plan'
import { addDays, formatDay, formatHours } from '../model/time'

export function TotalsScreen({ workspace, shifts, now, draft }: { workspace: Workspace; shifts: Shift[]; now: number; draft: boolean }) {
  const byPerson = totals(workspace, shifts, now)
  const highest = Math.max(1, ...[...byPerson.values()].map(x => x.load))
  return (
    <div className="page">
      <section>
        <h2>{t().totals.title}</h2>
        <p className="hint">
          {workspace.period ? t().totals.hintPeriod(formatDay(workspace.period.start), formatDay(addDays(workspace.period.end, -1))) : t().totals.hintAll}
          {draft && ` ${t().totals.includesDraft}`}
        </p>
        {workspace.people.length ? (
          <table className="totals">
            <thead>
              <tr><th>{t().totals.person}</th><th>{t().totals.worked}</th><th>{t().totals.upcoming}</th><th>{t().totals.shiftsAhead}</th><th>{t().totals.workload}</th></tr>
            </thead>
            <tbody>
              {workspace.people.map(p => {
                const total = byPerson.get(p.id)!
                return (
                  <tr key={p.id}>
                    <td><span className="swatch" style={{ background: p.color }} /><span dir="auto">{p.name}</span></td>
                    <td>{formatHours(total.pastMinutes)}</td>
                    <td>{formatHours(total.futureMinutes)}</td>
                    <td>{total.futureShifts}</td>
                    <td className="load">
                      <span className="bar" aria-hidden><i style={{ width: `${(total.load / highest) * 100}%`, background: p.color }} /></span>
                      {formatHours(total.load)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : <p>{t().totals.noPeople}</p>}
      </section>
    </div>
  )
}
