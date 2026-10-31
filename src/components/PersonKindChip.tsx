// 真人／示範用戶標籤：示範用戶是虛構角色（接手聊天不會有真人回覆），大廳、聊天室、歷史都要標出來。
import { Chip } from '@components/ui/Button'

export function PersonKindChip({ isSeed }: { isSeed: boolean | undefined }) {
  if (isSeed === undefined) return null
  return isSeed ? (
    <Chip tone="well" className="person-kind">
      示范用户
    </Chip>
  ) : (
    <Chip tone="mint" className="person-kind">
      真人
    </Chip>
  )
}
