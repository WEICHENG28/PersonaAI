import { useRive, type UseRiveOptions } from '@rive-app/react-canvas'

const SOURCES = {
  robot: '/riv/clover_bot.riv',
  fish: '/riv/fish_vase.riv',
  birdie: '/riv/red_birdie.riv',
} as const

export type RiveName = keyof typeof SOURCES

interface RiveAvatarProps {
  name: RiveName
  size?: number
  className?: string
  options?: Partial<UseRiveOptions>
}

/** Rive 头像：robot＝AI 朋友阿澈、fish＝大厅、birdie＝登录页 */
export function RiveAvatar({ name, size = 120, className, options }: RiveAvatarProps) {
  const { RiveComponent } = useRive({
    src: SOURCES[name],
    autoplay: true,
    stateMachines: 'State Machine 1',
    ...options,
  })
  return (
    <RiveComponent
      style={{ width: size, height: size }}
      className={className}
      aria-hidden
    />
  )
}
