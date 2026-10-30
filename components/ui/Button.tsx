import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'md' | 'sm'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  // Hum card-stock button: ink border on paper, pressed feel on hover
  primary: 'bg-friend text-text border-2 border-text hover:translate-y-[1px]',
  secondary: 'bg-surface text-text border-2 border-text hover:translate-y-[1px]',
  ghost: 'bg-transparent text-text border-2 border-transparent hover:bg-surface',
}

const sizeClasses: Record<Size, string> = {
  md: 'px-5 py-2.5 text-sm',
  sm: 'px-3 py-1.5 text-xs',
}

/**
 * Hum-styled button. Hover, focus-visible and disabled states are guaranteed
 * by the base classes plus the global focus-visible rule in globals.css.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`rounded-md font-semibold shadow-sticker transition-transform disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  )
})
