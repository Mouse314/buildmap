import * as React from 'react'
import { HudButton } from './ui/hud'

export type GlassDropdownOption = {
  value: string
  label: string
}

export function GlassDropdown({
  value,
  options,
  onChange,
  className,
  buttonClassName,
}: {
  value: string
  options: GlassDropdownOption[]
  onChange: (value: string) => void
  className?: string
  buttonClassName?: string
}) {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  const selectedLabel = React.useMemo(() => {
    return options.find((o) => o.value === value)?.label ?? ''
  }, [options, value])

  React.useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className={['glassDropdown', className].filter(Boolean).join(' ')}
      data-open={open ? 'true' : 'false'}
    >
      <HudButton
        title={selectedLabel}
        data={{ action: 'toggle-glass-dropdown' }}
        className={['glassDropdownButton', buttonClassName].filter(Boolean).join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
      >
        <span className="glassDropdownValue">{selectedLabel}</span>
        <span className="glassDropdownChevron" aria-hidden>
          ▾
        </span>
      </HudButton>

      <div className="glassDropdownMenu" role="listbox">
        {options.map((opt) => {
          const selected = opt.value === value
          return (
            <HudButton
              key={opt.value}
              title={opt.label}
              data={{ action: 'select-glass-dropdown-option', value: opt.value }}
              className={selected ? 'glassDropdownItem glassDropdownItemSelected' : 'glassDropdownItem'}
              role="option"
              aria-selected={selected}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {opt.label}
            </HudButton>
          )
        })}
      </div>
    </div>
  )
}
