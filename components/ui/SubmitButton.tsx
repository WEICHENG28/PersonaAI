'use client'

/**
 * Submit button driven by the parent form's pending state (React 18
 * compatible — no useTransitionState). Keeps full hover/disabled states.
 */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pending: boolean
  pendingLabel: string
}) {
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      className="w-full rounded-md border-2 border-text bg-friend px-5 py-2.5 text-sm font-semibold shadow-sticker transition-transform hover:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
