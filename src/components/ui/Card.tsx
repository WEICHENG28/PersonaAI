import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** Hum 纸卡：24px 圆角、grain+fibre 纸纹、影子往右下掉 */
export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  )
}

interface CardHeadProps {
  title: string
  sub?: string
  right?: ReactNode
}

/** 卡片头：标题 + 副标 + 右侧动作 */
export function CardHead({ title, sub, right }: CardHeadProps) {
  return (
    <div className="card-head">
      <div className="card-head__text">
        <h2 className="card-head__title">{title}</h2>
        {sub && <p className="card-head__sub">{sub}</p>}
      </div>
      {right && <div className="card-head__right">{right}</div>}
    </div>
  )
}
