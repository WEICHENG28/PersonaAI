import { DEMO_SCREENED } from './scenario'

/** Demo 回报卡的数字（UX #7）：全部从 store 状态算，不写死。 */

export interface DemoReportInput {
  proxyDone: boolean
  /** 任务进度（双向合适人数） */
  progress: number
  avgManualMin: number
}

export interface DemoReportStats {
  screened: number
  chats: number
  fit: number
  savedMinutes: number
}

/** 和陈岭那一场在林小山之前就结束了（见工作日志），所以至少算 1 场 */
const FINISHED_BEFORE_LIN = 1

export function demoReportStats({ proxyDone, progress, avgManualMin }: DemoReportInput): DemoReportStats {
  const chats = FINISHED_BEFORE_LIN + (proxyDone ? 1 : 0)
  return { screened: DEMO_SCREENED, chats, fit: progress, savedMinutes: chats * avgManualMin }
}

export function reportLead(s: DemoReportStats): string {
  const head = `你不在的时候我帮你看了一下：筛了 ${s.screened} 个人、代聊了 ${s.chats} 场，`
  if (s.fit <= 0) return `${head}暂时还没有特别合的，我会继续帮你留意。`
  return `${head}有 ${s.fit} 个跟你很合，也喜欢爬山，要不要看看？`
}
