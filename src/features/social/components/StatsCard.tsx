import { Card, CardHead } from '@components/ui/Card'
import { t } from '@i18n/t'
import { formatDuration } from '../formatDuration'

export interface StatsCardProps {
  screened: number
  chats: number
  suitable: number
  savedMinutes: number
  /** 計算依據，例如「代聊 6 场 × 人工平均 20 分钟」 */
  basis: string
}

/** 效率統計（07B 的 B8）：四個數字＋計算依據，例如「省下约 2 小时（代聊 6 场 × 人工平均 20 分钟）」。 */
export function StatsCard({ screened, chats, suitable, savedMinutes, basis }: StatsCardProps) {
  return (
    <Card>
      <CardHead title={t('report.statsTitle')} sub={t('report.friendTone')} />
      <div className="stats-row">
        <div className="stat">
          <b>{screened}</b>
          <span>{t('report.statScanned')}</span>
        </div>
        <div className="stat">
          <b>{chats}</b>
          <span>{t('report.statChatted')}</span>
        </div>
        <div className="stat stat--mint">
          <b>{suitable}</b>
          <span>位合适</span>
        </div>
      </div>
      <p className="report__calc">
        省下{formatDuration(savedMinutes)}（{basis}）<em>{t('report.calcNoteAdjust')}</em>
      </p>
    </Card>
  )
}

