/** 三点脉冲加载指示（复用 .dot-pulse 动画）。
 *  用法：<LoadingDots /> 或 <LoadingDots label="加载中" /> */
export function LoadingDots({ label = '加载中' }: { label?: string }) {
  return (
    <span className="loading-dots" aria-label={label} role="status">
      <span className="dot-pulse" />
      <span className="dot-pulse" />
      <span className="dot-pulse" />
    </span>
  )
}
