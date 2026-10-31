import { useEffect } from 'react'
import { useRive, type UseRiveOptions } from '@rive-app/react-canvas'

const SOURCES = {
  /** chromabot.riv（Rive 7.5，含 ViewModel + State Machine 1）——登录页 & AI 朋友 */
  chromabot: import.meta.env.BASE_URL + 'riv/chromabot.riv',
  fish: import.meta.env.BASE_URL + 'riv/fish_vase.riv',
  birdie: import.meta.env.BASE_URL + 'riv/red_birdie.riv',
} as const

export type RiveName = keyof typeof SOURCES

interface RiveAvatarProps {
  name: RiveName
  /** 固定像素尺寸（fill 模式下忽略） */
  size?: number
  /** 由外层 CSS 控制尺寸（canvas 填满容器）；用于 chromabot 占屏幕高度百分比等场景 */
  fill?: boolean
  className?: string
  options?: Partial<UseRiveOptions>
}

/**
 * Rive 头像。
 *
 * 关键：所有文件（包括 chromabot Rive 7.5 ViewModel 格式）都传 stateMachines。
 * 之前的「0×0 bug」根本原因是 shouldResizeCanvasToContainer 默认 true，
 * Rive 读容器 clientWidth/clientHeight（为 0）导致画布塌缩，
 * 与 ViewModel 或 stateMachines 无关。
 *
 * 修复：
 * 1. shouldResizeCanvasToContainer: false —— 不让 Rive 自动读容器
 * 2. useEffect 在 rive 加载后手动把 canvas 尺寸设好并触发重算
 *    - 默认：canvas = size × size 像素
 *    - fill：canvas 填满容器（100%），尺寸由外层 CSS 决定（容器须有确定高度）
 */
export function RiveAvatar({ name, size = 120, fill = false, className, options }: RiveAvatarProps) {
  const { rive, canvas, RiveComponent } = useRive(
    {
      src: SOURCES[name],
      stateMachines: 'State Machine 1',
      autoplay: true,
      ...options,
    },
    { shouldResizeCanvasToContainer: false },
  )

  // Rive 加载后：强制设置 canvas 尺寸并触发重绘
  useEffect(() => {
    if (!canvas || !rive) return
    if (fill) {
      // 填满模式：跟随容器（容器须由 CSS 给出确定尺寸）
      canvas.style.width = '100%'
      canvas.style.height = '100%'
    } else {
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
    }
    rive.resizeDrawingSurfaceToCanvas()
  }, [rive, canvas, size, fill])

  return (
    <RiveComponent
      style={fill ? { width: '100%', height: '100%' } : { width: size, height: size }}
      className={className}
      aria-hidden
    />
  )
}
