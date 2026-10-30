// A 提供的跨線函式（docs/07 第 6 節）。目前是 stub：簽名正確、回傳 server/fixtures 假資料。
// 擁有者：A。簽名是共用約定，改前三人同意；內部實作 A 自由替換。
import type { AgentProfile, ShareableProfile, StyleProfile, TaskReport } from '../../shared/types'
import { fakeAgentProfile, fakeShareable, fakeStyle } from '../fixtures/friend'

export async function getShareableProfile(_userId: string): Promise<ShareableProfile | null> {
  return { ...fakeShareable }
}

/** 含 Big Five，只有 B 可以呼叫；不可傳給分身或前端。 */
export async function getAgentProfile(_userId: string): Promise<AgentProfile | null> {
  return structuredClone(fakeAgentProfile)
}

export async function getStyleProfile(_userId: string): Promise<StyleProfile | null> {
  return { ...fakeStyle }
}

export async function deliverReport(_userId: string, _report: TaskReport): Promise<void> {}
