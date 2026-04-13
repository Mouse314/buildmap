import * as React from 'react'

type HudButtonActionPayload = {
  title: React.ReactNode
  context?: React.ReactNode
  data?: unknown
}

type HudButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'onClick'> & {
  title: React.ReactNode
  context?: React.ReactNode
  hint?: string
  data?: unknown
  onAction?: (payload: HudButtonActionPayload, event: React.MouseEvent<HTMLButtonElement>) => void
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  leading?: React.ReactNode
  trailing?: React.ReactNode
  contentClassName?: string
  titleClassName?: string
  contextClassName?: string
}

function cx(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(' ')
}

export function HudButton({
  title,
  context,
  hint,
  data,
  onAction,
  onClick,
  leading,
  trailing,
  className,
  contentClassName,
  titleClassName,
  contextClassName,
  children,
  type = 'button',
  ...rest
}: HudButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx('hudButton', className)}
      title={hint}
      onClick={(event) => {
        onClick?.(event)
        onAction?.({ title, context, data }, event)
      }}
    >
      {children ?? (
        <span className={cx('hudButtonContent', contentClassName)}>
          {leading ? <span className="hudButtonLeading">{leading}</span> : null}
          <span className="hudButtonTextWrap">
            <span className={cx('hudButtonTitle', titleClassName)}>{title}</span>
            {context ? <span className={cx('hudButtonContext', contextClassName)}>{context}</span> : null}
          </span>
          {trailing ? <span className="hudButtonTrailing">{trailing}</span> : null}
        </span>
      )}
    </button>
  )
}
