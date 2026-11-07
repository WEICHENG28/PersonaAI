/** 单调时钟：mark 记录距上次 mark 的耗时，相同标签累加。 */
export function startTimer(): { mark(label: string): void; spans(): Record<string, number>; totalMs(): number } {
  const started = performance.now()
  let previous = started
  const elapsed = Object.create(null) as Record<string, number>
  return {
    mark(label) {
      const now = performance.now()
      elapsed[label] = (elapsed[label] ?? 0) + now - previous
      previous = now
    },
    spans: () => ({ ...elapsed }),
    totalMs: () => performance.now() - started,
  }
}
