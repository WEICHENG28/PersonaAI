/**
 * Demo 排程器：分两组，代聊时间轴（proxy）可以单独停掉（本人接手、关闭社交 Agent）。
 */

type Group = 'general' | 'proxy'

const groups: Record<Group, ReturnType<typeof setTimeout>[]> = { general: [], proxy: [] }

export function later(ms: number, fn: () => void, group: Group = 'general'): void {
  const list = groups[group]
  const id = setTimeout(() => {
    const i = list.indexOf(id)
    if (i >= 0) list.splice(i, 1)
    fn()
  }, ms)
  list.push(id)
}

export function clearTimers(group?: Group): void {
  const targets: Group[] = group ? [group] : ['general', 'proxy']
  for (const g of targets) {
    groups[g].forEach(clearTimeout)
    groups[g].length = 0
  }
}

let seq = 0
/** demo 资料的流水号（加上时间避免重新整理后跟存档里的 id 撞） */
export const uid = (): string => `x${Date.now().toString(36)}${++seq}`
