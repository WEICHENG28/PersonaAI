import { useLayoutEffect, useRef } from 'react'

/** 聊天区自动滚到底（新讯息进来时） */
export function useAutoScrollBottom<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [dep])
  return ref
}
