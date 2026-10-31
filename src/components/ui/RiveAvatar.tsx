import { useEffect } from 'react'
import { useRive, useViewModel, useViewModelInstance, type UseRiveOptions } from '@rive-app/react-canvas'

const SOURCES = {
  /** chromabot.riv（Rive 7.5，ViewModel 数据绑定）——登录页 & AI 朋友阿澈 */
  chromabot: import.meta.env.BASE_URL + 'riv/chromabot.riv',
  fish: import.meta.env.BASE_URL + 'riv/fish_vase.riv',
  birdie: import.meta.env.BASE_URL + 'riv/red_birdie.riv',
} as const

export type RiveName = keyof typeof SOURCES

interface RiveAvatarProps {
  name: RiveName
  size?: number
  className?: string
  options?: Partial<UseRiveOptions>
}

/**
 * Rive 头像。
 * chromabot＝AI 朋友阿澈＆登录页主角（Rive 7.5 ViewModel 数据绑定格式）
 * fish＝分身大厅  birdie＝评审 Agent（landing 展示用）
 *
 * 关于 chromabot 的坑：
 * - 传 stateMachines → Rive 7.5 ViewModel 文件会让 canvas 变 0×0（运行时 bug）
 * - 不传 SM + 不初始化 ViewModel → canvas 尺寸正常但全空白（无颜色/形状数据）
 * - 正确做法：不传 SM，用 useViewModelInstance 绑默认实例 → canvas 正常渲染动画
 */
export function RiveAvatar({ name, size = 120, className, options }: RiveAvatarProps) {
  // chromabot.riv（Rive 7.5）：不传 SM 避免 0×0 bug；其余文件（7.0/7.4）正常传 SM
  const isViewModelFile = name === 'chromabot'

  const { rive, canvas, RiveComponent } = useRive(
    {
      src: SOURCES[name],
      autoplay: true,
      ...(isViewModelFile ? {} : { stateMachines: 'State Machine 1' }),
      ...options,
    },
    { shouldResizeCanvasToContainer: false },
  )

  // 初始化 ViewModel 默认实例——对非 ViewModel 文件是空操作（vm 为 null）
  const vm = useViewModel(rive)
  const instance = useViewModelInstance(vm)

  // Rive 7.5 ViewModel 文件：加载后 artboard 尺寸为 0×0，Rive 会覆盖 style prop。
  // ViewModel 实例绑定后，强制把 canvas style 设回目标尺寸并触发重绘。
  useEffect(() => {
    if (!canvas || !rive) return
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    rive.resizeDrawingSurfaceToCanvas()
  }, [rive, instance, canvas, size])

  return (
    <RiveComponent
      style={{ width: size, height: size }}
      className={className}
      aria-hidden
    />
  )
}
