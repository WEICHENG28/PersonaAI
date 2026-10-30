'use client'

import { useRive } from '@rive-app/react-canvas'

export interface RiveAvatarProps {
  /** Path under /public, e.g. /riv/robot.riv */
  src: string
  /** Accessibility label */
  name: string
  size?: 'sm' | 'md' | 'lg'
  /** Rive state machine to drive; defaults to the file's first one */
  stateMachine?: string
}

const sizeClasses = {
  sm: 'h-10 w-10',
  md: 'h-14 w-14',
  lg: 'h-24 w-24',
} as const

/**
 * Animated Rive avatar (client leaf component). Falls back to nothing visible
 * if WASM fails to load; the surrounding avatar slot keeps its card look.
 */
export function RiveAvatar({ src, name, size = 'md', stateMachine }: RiveAvatarProps) {
  const { RiveComponent } = useRive({
    src,
    stateMachine,
    autoplay: true,
  })

  return (
    <span
      role="img"
      aria-label={name}
      className={`inline-flex items-center justify-center overflow-hidden rounded-full border-2 border-text bg-surface shadow-sticker ${sizeClasses[size]}`}
    >
      {RiveComponent ? (
        <RiveComponent className="h-full w-full" />
      ) : (
        <span className="text-xs font-bold">{name.charAt(0)}</span>
      )}
    </span>
  )
}
