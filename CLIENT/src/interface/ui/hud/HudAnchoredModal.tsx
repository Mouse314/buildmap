import * as React from 'react'
import { HudButton } from './HudButton'

function cx(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(' ')
}

type HudAnchoredModalProps = {
  isOpen: boolean
  anchor: { x: number; y: number }
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
  aboveClassName?: string
  belowClassName?: string
  topBarSelector?: string
  allowBackdropPointerType?: 'any' | 'mouse'
  reflowToken?: unknown
  children: React.ReactNode
}

export function HudAnchoredModal({
  isOpen,
  anchor,
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
  aboveClassName,
  belowClassName,
  topBarSelector = '.topBar',
  allowBackdropPointerType = 'mouse',
  reflowToken,
  children,
}: HudAnchoredModalProps) {
  const modalRef = React.useRef<HTMLDivElement | null>(null)
  const [placement, setPlacement] = React.useState<'above' | 'below'>('above')
  const [pos, setPos] = React.useState<{ left: number; top: number }>({
    left: anchor.x,
    top: anchor.y,
  })

  React.useLayoutEffect(() => {
    if (!isOpen) return
    const el = modalRef.current
    if (!el) return

    const padding = 12
    const gap = 12

    const topBarEl = document.querySelector<HTMLElement>(topBarSelector)
    const topBarBottom = topBarEl ? topBarEl.getBoundingClientRect().bottom : 0
    const safeTop = Math.max(padding, Math.ceil(topBarBottom) + 8)

    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
    const left = clamp(anchor.x, padding + r.width / 2, vw - padding - r.width / 2)

    const canPlaceAbove = anchor.y - gap - r.height >= safeTop
    const canPlaceBelow = anchor.y + gap + r.height <= vh - padding

    let nextPlacement: 'above' | 'below' = placement
    if (nextPlacement === 'above' && !canPlaceAbove && canPlaceBelow) {
      nextPlacement = 'below'
    } else if (nextPlacement === 'below' && !canPlaceBelow && canPlaceAbove) {
      nextPlacement = 'above'
    } else if (!canPlaceAbove && canPlaceBelow) {
      nextPlacement = 'below'
    } else if (canPlaceAbove) {
      nextPlacement = 'above'
    }

    const topMin = nextPlacement === 'above' ? safeTop + r.height + gap : safeTop - gap
    const topMaxRaw = nextPlacement === 'above' ? vh - padding : vh - padding - r.height - gap
    const topMax = Math.max(topMin, topMaxRaw)
    const top = clamp(anchor.y, topMin, topMax)

    setPlacement(nextPlacement)
    setPos({ left, top })
  }, [anchor.x, anchor.y, isOpen, placement, reflowToken, topBarSelector])

  React.useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const placementClassName = placement === 'above' ? aboveClassName : belowClassName

  return (
    <div
      className={cx('hudAnchoredModalOverlay', overlayClassName)}
      onPointerDown={(event) => {
        if (allowBackdropPointerType === 'mouse' && event.pointerType !== 'mouse') return
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={modalRef}
        className={cx('hudAnchoredModalSurface', surfaceClassName, placementClassName)}
        style={{ left: pos.left, top: pos.top }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className={cx('hudAnchoredModalHeader', headerClassName)}>
          <div className="hudAnchoredModalTitleWrap">
            <div className={cx('hudAnchoredModalTitle', titleClassName)}>{title}</div>
            {context ? <div className={cx('hudAnchoredModalContext', contextClassName)}>{context}</div> : null}
          </div>

          <HudButton
            title="×"
            data={data}
            className={cx('hudAnchoredModalClose', closeButtonClassName)}
            aria-label={closeLabel}
            onClick={onClose}
          >
            ×
          </HudButton>
        </header>

        <div className={cx('hudAnchoredModalBody', bodyClassName)}>{children}</div>
      </section>
    </div>
  )
}
