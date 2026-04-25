import * as React from 'react'
import { HudButton } from './HudButton'

function cx(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(' ')
}

type HudModalProps = {
  isOpen: boolean
  onClose: () => void
  title: React.ReactNode
  context?: React.ReactNode
  data?: unknown
  overlayClassName?: string
  surfaceClassName?: string
  headerClassName?: string
  bodyClassName?: string
  titleClassName?: string
  contextClassName?: string
  closeButtonClassName?: string
  closeLabel?: string
  headerActions?: React.ReactNode
  closeOnOverlayClick?: boolean
  children: React.ReactNode
}

export function HudModal({
  isOpen,
  onClose,
  title,
  context,
  data,
  overlayClassName,
  surfaceClassName,
  headerClassName,
  bodyClassName,
  titleClassName,
  contextClassName,
  closeButtonClassName,
  closeLabel = 'Закрыть',
  headerActions,
  closeOnOverlayClick = true,
  children,
}: HudModalProps) {
  if (!isOpen) return null

  return (
    <div
      className={cx('hudModalOverlay', overlayClassName)}
      onClick={(event) => {
        if (!closeOnOverlayClick) return
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className={cx('hudModalSurface', surfaceClassName)} onClick={(event) => event.stopPropagation()}>
        <header className={cx('hudModalHeader', headerClassName)}>
          <div className="hudModalTitleWrap">
            <div className={cx('hudModalTitle', titleClassName)}>{title}</div>
            {context ? <div className={cx('hudModalContext', contextClassName)}>{context}</div> : null}
          </div>

          {headerActions}

          <HudButton
            title="×"
            context={undefined}
            data={data}
            className={cx('hudModalClose', closeButtonClassName)}
            aria-label={closeLabel}
            onClick={onClose}
          >
            ×
          </HudButton>
        </header>

        <div className={cx('hudModalBody', bodyClassName)}>{children}</div>
      </section>
    </div>
  )
}
