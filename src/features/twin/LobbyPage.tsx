import { isLiveChat } from '@lib/api/twin'
import { LiveLobby } from './components/LiveLobby'
import { DemoLobby } from './DemoLobby'

/** 画面 10：大厅（候选人卡片 + fish Rive + 大厅 AI 助手）。http 模式是真资料（C9／C10），mock 模式跑 demo。 */
export function LobbyPage() {
  return isLiveChat ? <LiveLobby /> : <DemoLobby />
}
