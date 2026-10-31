import { useParams } from 'react-router'
import { isLiveChat } from '@lib/api/twin'
import { LiveChatRoom } from './components/LiveChatRoom'
import { DemoProxyChat } from './DemoProxyChat'
import { DemoHumanChat } from './DemoHumanChat'

/** 画面 5：聊天室。http 模式且网址有对话 id（/chat/:id）→ 真资料；mock：/chat/lin 是代聊 demo，其他 id 是本人聊天 demo。 */
export function ProxyChatPage() {
  const { id } = useParams()
  if (isLiveChat && id) return <LiveChatRoom key={id} conversationId={id} />
  if (id) return <DemoHumanChat key={id} chatId={id} />
  return <DemoProxyChat />
}
