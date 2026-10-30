import Image from 'next/image'

export interface AvatarProps {
  name: string
  src?: string
  /** 24 / 32 / 48 px */
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-12 w-12 text-sm',
} as const

/** Initial-based avatar with optional image. Distinct per role via className. */
export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const initial = name.trim().charAt(0) || '?'
  return (
    <span
      className={`inline-flex select-none items-center justify-center overflow-hidden rounded-full border-2 border-text bg-human font-bold text-text ${sizeClasses[size]}`}
      aria-hidden={false}
      role="img"
      aria-label={name}
    >
      {src ? (
        <Image src={src} alt={name} width={48} height={48} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  )
}
