import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  small?: boolean
  block?: boolean
}

const variantClass: Record<Variant, string> = {
  primary: 'btn--primary',
  secondary: 'btn--secondary',
  danger: 'btn--danger',
}

/** Hum 卡纸按钮：54px 高、16px 圆角、底部实色边缘会压下去 */
export function Button({
  variant = 'primary',
  small,
  block,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variantClass[variant],
    small ? 'btn--small' : '',
    block ? 'btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  )
}

interface ChipProps {
  tone?: 'paper' | 'ink' | 'well' | 'mint' | 'pear' | 'coral'
  children: ReactNode
  className?: string
}

const chipTone: Record<NonNullable<ChipProps['tone']>, string> = {
  paper: '',
  ink: 'chip--ink',
  well: 'chip--well',
  mint: 'chip--mint',
  pear: 'chip--pear',
  coral: 'chip--coral',
}

/** 小纸片 chip（Hum 规范：无 emoji、600 字重） */
export function Chip({ tone = 'paper', className = '', children }: ChipProps) {
  return <span className={`chip ${chipTone[tone]} ${className}`}>{children}</span>
}
