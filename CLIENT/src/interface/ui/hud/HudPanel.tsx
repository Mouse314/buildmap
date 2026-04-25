import * as React from 'react'
import { HudButton } from './HudButton'

function cx(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(' ')
}

type HudPanelProps = {
  title: React.ReactNode
  context?: React.ReactNode
  data?: unknown
  className?: string
  headerClassName?: string
  bodyClassName?: string
  titleClassName?: string
  contextClassName?: string
  showHeader?: boolean
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
  toggleButtonClassName?: string
  children?: React.ReactNode
  headerActions?: React.ReactNode
}

export function HudPanel({
  title,
  context,
  className,
  headerClassName,
  bodyClassName,
  titleClassName,
  contextClassName,
  showHeader = true,
  collapsible = false,
  expanded = true,
  onToggle,
  toggleButtonClassName,
  headerActions,
  children,
}: HudPanelProps) {
  const canToggle = collapsible && typeof onToggle === 'function'
  const isExpanded = canToggle ? expanded : true

  return (
    <section className={cx('hudPanel', className)} aria-label={typeof title === 'string' ? title : undefined}>
      {showHeader ? (
        <header className={cx('hudPanelHeader', headerClassName)}>
          <div className="hudPanelTitleWrap">
            <div className={cx('hudPanelTitle', titleClassName)}>{title}</div>
            {context ? <div className={cx('hudPanelContext', contextClassName)}>{context}</div> : null}
          </div>

          {headerActions}

          {canToggle ? (
            <HudButton
              title={expanded ? 'Свернуть' : 'Развернуть'}
              data={{ action: 'toggle-panel' }}
              className={cx('hudPanelToggle', toggleButtonClassName)}
              aria-expanded={expanded}
              onClick={onToggle}
            >
              {expanded ? '▾' : '▸'}
            </HudButton>
          ) : null}
        </header>
      ) : null}

      <div
        className={cx(
          'hudPanelBodyWrap',
          isExpanded ? 'hudPanelBodyWrapExpanded' : 'hudPanelBodyWrapCollapsed'
        )}
        aria-hidden={isExpanded ? undefined : true}
      >
        <div className={cx('hudPanelBody', bodyClassName)}>{children}</div>
      </div>
    </section>
  )
}
