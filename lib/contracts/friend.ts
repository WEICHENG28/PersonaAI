import type { AgentProfile, ShareableProfile, StyleProfile } from '@/lib/types'
import { shareableProfile as shareableFixture, agentProfile as agentFixture } from '@/fixtures/friend'

/**
 * A 線跨線函式 stub（07 §6）。回傳 fixtures 假資料；A4 完成時換成真實作，
 * 簽名不變。B、C 只能透過這裡拿 A 線的資料。
 */

/** 回傳對外檔案；沒有就回 null。（B、C 使用） */
export async function getShareableProfile(userId: string): Promise<ShareableProfile | null> {
  void userId // stub：不查資料庫，直接回假資料
  return shareableFixture
}

/** 含 Big Five。**只有 B 的後台邏輯可呼叫**，不可傳給分身或前端。 */
export async function getAgentProfile(userId: string): Promise<AgentProfile | null> {
  void userId
  return agentFixture
}

/** 只回說話風格。（C 使用） */
export async function getStyleProfile(userId: string): Promise<StyleProfile | null> {
  void userId
  return agentFixture.style
}
