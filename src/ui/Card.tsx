import { useId, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { Icon } from './Icon'

/** An on/off switch. */
export function Switch({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

interface CardProps {
  title: string
  /** Whether the rule must hold or is a goal; shown next to the switch. */
  badge?: 'required' | 'preference'
  /** One line about the current settings, shown whether or not the card is open. */
  summary: ReactNode
  /** With a working switch when given; settings stay as they are while switched off. */
  enabled?: boolean
  onToggle?: (enabled: boolean) => void
  /** Shows a switch that is on and can't be turned off. */
  alwaysOn?: boolean
  children: ReactNode
}

/** A setting or rule: a summary that opens to show its settings. */
export function Card({ title, badge, summary, enabled, onToggle, alwaysOn, children }: CardProps) {
  const [open, setOpen] = useState(false)
  const body = useId()
  const off = enabled === false
  return (
    <div className={`card${off ? ' off' : ''}`}>
      <div className="card-head">
        <button className="card-toggle" aria-expanded={open} aria-controls={body} onClick={() => setOpen(o => !o)}>
          <b className="card-title">{title}</b>
          <span className="card-summary">{off ? t().settings.off : summary}</span>
        </button>
        {/* How the rule behaves sits next to whether it is on. */}
        <span className="card-state">
          {badge && <span className={`badge ${badge}`}>{t().settings[badge]}</span>}
          {onToggle && <Switch checked={!off} label={title} onChange={onToggle} />}
          {alwaysOn && <Switch checked disabled label={t().common.alwaysOn(title)} onChange={() => {}} />}
        </span>
        <button className="icon" aria-label={open ? t().common.closeWhat(title) : t().common.open(title)} aria-expanded={open} aria-controls={body} onClick={() => setOpen(o => !o)}>
          <Icon name={open ? 'up' : 'down'} size={16} />
        </button>
      </div>
      {open && <div className="card-body form" id={body}>{children}</div>}
    </div>
  )
}
