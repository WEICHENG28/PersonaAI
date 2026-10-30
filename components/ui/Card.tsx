import type { HTMLAttributes } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Slight hand-made tilt for decorative cards */
  tilt?: 'none' | 'left' | 'right'
}

const tiltClasses = {
  none: '',
  left: 'hum-tilt-left',
  right: 'hum-tilt-right',
} as const

/** Hum cut-paper card. */
export function Card({ tilt = 'none', className = '', ...props }: CardProps) {
  return (
    <div
      className={`hum-card p-5 ${tiltClasses[tilt]} ${className}`}
      {...props}
    />
  )
}
