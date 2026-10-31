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
  size?: number
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
 * 2. useEffect 在 rive 加载后手动把 canvas.style 设为目标尺寸并触发重算
 */
export function RiveAvatar({ name, size = 120, className, options }: RiveAvatarProps) {
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
  // （Rive 内部会先按 artboard 原始尺寸设 style，我们在这里覆盖）
  useEffect(() => {
    if (!canvas || !rive) return
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    rive.resizeDrawingSurfaceToCanvas()
  }, [rive, canvas, size])

  return (
    <RiveComponent
      style={{ width: size, height: size }}
      className={className}
      aria-hidden
    />
  )
}
