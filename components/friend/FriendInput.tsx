'use client'

import { useState } from 'react'

export interface FriendInputProps {
  placeholder: string
  sendLabel: string
  disabledLabel: string
}

/**
 * Chat composer. Disabled in the skeleton (A2 wires it to /api/friend/chat);
 * keeps full hover/focus/disabled states per 07 §8.1.
 */
export function FriendInput({ placeholder, sendLabel, disabledLabel }: FriendInputProps) {
  const [value, setValue] = useState('')

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        setValue('')
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        maxLength={1000}
        disabled
        title={disabledLabel}
        className="flex-1 rounded-md border-2 border-text bg-surface px-3.5 py-2.5 text-sm"
      />
      <button
        type="submit"
        disabled
        title={disabledLabel}
        className="rounded-md border-2 border-text bg-friend px-4 py-2.5 text-sm font-semibold shadow-sticker transition-transform hover:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sendLabel}
      </button>
    </form>
  )
}
