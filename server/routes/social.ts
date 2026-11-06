// B 線的 API 路由，掛在 /api 底下（例如 socialRoutes.get('/xxx') → GET /api/xxx）。擁有者：B。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { LlmError } from '../lib/llm/index.js'
import { TaskError, changeTaskStatus, createTaskFromText, editTask, getOwnTask, type TaskAction } from '../social/task.js'
import { startConversation } from '../contracts/twin.js'
import { getAgentStore } from '../social/agentStore.js'
import { listHistory, reopenAttempt } from '../social/history.js'
import { runTaskStepSafely } from '../social/runner.js'
import { computeStats } from '../social/stats.js'
import { getTaskStore } from '../social/taskStore.js'
import { defaultRunnerDeps } from '../social/runnerDeps.js'
import { requireUserId } from '../social/user.js'
import { listMyChats } from '../social/chats.js'
import { acceptLobbyInvite, getLobbyInvite, isProfileComplete } from '../social/lobbyInvite.js'
import { firstTaskText, loadOnboardingState, normalizeQuickProfile, onboardingView } from '../social/onboarding.js'
import { updateShareable } from '../friend/profile.js'
import { supabaseLobbyInviteDeps } from '../social/lobbyInviteDeps.js'
import { REPORT_REASONS, blockUser, defaultSafetyStore, listMyBlocks, reportUser, unblockUser, type ReportReason } from '../social/safety.js'

export const socialRoutes = new Hono()

const createBody = z.object({ text: z.string().trim().min(1).max(200) })

// 先驗身分再看內容：沒登入一律 401，不先回內容格式錯誤
socialRoutes.post('/tasks', (c) =>
  respond(c, async (userId) => {
    const body = createBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) throw new TaskError('请用一句话说说想找什么样的人（200 字以内）')
    return createTaskFromText(userId, body.data.text)
  }),
)

/** 真人進大廳：能不能邀請（聊夠了＋對外檔案夠完整），以及用戶按「加入大厅」。 */
socialRoutes.get('/lobby-invite', (c) => respond(c, (userId) => getLobbyInvite(userId, supabaseLobbyInviteDeps())))
socialRoutes.post('/lobby-invite/accept', (c) => respond(c, (userId) => acceptLobbyInvite(userId, supabaseLobbyInviteDeps())))

/** 頂欄「我的聊天」：還沒結束、和我有關的對話。 */
socialRoutes.get('/chats', (c) => respond(c, (userId) => listMyChats(userId)))

/** B10：我最近的任務（任務頁列表）。 */
socialRoutes.get('/tasks', (c) => respond(c, (userId) => getTaskStore().listByUser(userId, 20)))

/** B10：任務的效率統計（附計算依據）。 */
socialRoutes.get('/tasks/:id/stats', (c) =>
  respond(c, async (userId) => {
    const task = await getOwnTask(userId, c.req.param('id'))
    const { manual_minutes_per_chat } = await getAgentStore().userSettings(userId)
    return computeStats(task.progress, manual_minutes_per_chat)
  }),
)

/** 確認卡上修改任務（只在待確認時）。 */
const editBody = z.object({
  purpose: z.enum(['friend', 'study', 'sport', 'hobby']),
  conditions: z.array(z.string().max(30)).max(8),
  count: z.number().int(),
  suitable_count: z.number().int(),
  max_chats: z.number().int(),
})
socialRoutes.post('/tasks/:id/edit', (c) =>
  respond(c, async (userId) => {
    const body = editBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) throw new TaskError('任务内容格式不对，请再检查一次')
    return editTask(userId, c.req.param('id'), body.data)
  }),
)

socialRoutes.get('/tasks/:id', (c) => respond(c, (userId) => getOwnTask(userId, c.req.param('id'))))

for (const action of ['confirm', 'pause', 'resume', 'cancel'] as const satisfies TaskAction[]) {
  socialRoutes.post(`/tasks/:id/${action}`, (c) =>
    respond(c, (userId) => changeTaskStatus(userId, c.req.param('id'), action)),
  )
}

/** 開發用：不開 worker，手動推進任務一步（07B 的 B3）。 */
socialRoutes.post('/tasks/:id/step', (c) =>
  respond(c, async (userId) => {
    const id = c.req.param('id')
    await getOwnTask(userId, id)
    const outcome = await runTaskStepSafely(id, defaultRunnerDeps())
    return { outcome, task: await getOwnTask(userId, id) }
  }),
)

/** B6：歷史嘗試（不含分數）＋阿澈的觀察。 */
socialRoutes.get('/history', (c) => respond(c, (userId) => listHistory(userId, getAgentStore())))

const reopenBody = z.object({ mode: z.enum(['human', 'request_human']) })

/** B6：重啟對話。human → 本人去聊；request_human → 本人去聊並通知對方本人。前端導向 /chat/:conversationId。 */
socialRoutes.post('/history/:id/reopen', (c) =>
  respond(c, async (userId) => {
    const body = reopenBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) throw new TaskError('请选择本人去聊或直接请求真人')
    return reopenAttempt(userId, c.req.param('id'), body.data.mode, { store: getAgentStore(), startConversation })
  }),
)

const logsQuery = z.object({
  task_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/** B7：工作日誌（開發者面板初始載入；之後前端用 Realtime 訂閱新的）。 */
socialRoutes.get('/logs', (c) => {
  const q = logsQuery.safeParse(c.req.query())
  if (!q.success) return c.json({ ok: false, error: '参数不正确' }, 400)
  return respond(c, (userId) => getAgentStore().listLogs(userId, { taskId: q.data.task_id, limit: q.data.limit }))
})

/**
 * 先確認登入者，再執行 run。
 * TaskError 原樣回給用戶；LLM 失敗換成好懂的訊息；其他錯誤交給 app.onError。
 */
async function respond<T>(c: Context, run: (userId: string) => Promise<T>) {
  const userId = await requireUserId(c)
  if (userId instanceof Response) return userId
  try {
    return c.json({ ok: true, data: await run(userId) })
  } catch (err) {
    if (err instanceof TaskError) return c.json({ ok: false, error: err.message }, err.status)
    if (err instanceof LlmError) {
      console.error('[social]', err)
      return c.json({ ok: false, error: 'AI 暂时没有回应，请稍后再试' }, 503)
    }
    throw err
  }
}

// ===== 防濫用：屏蔽與檢舉（server/social/safety.ts） =====
const targetBody = z.object({ userId: z.uuid() })
const reportBody = z.object({
  userId: z.uuid(),
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]),
  note: z.string().trim().max(200).optional(),
  conversationId: z.uuid().optional(),
})

function safetyStore() {
  const store = defaultSafetyStore()
  if (!store) throw new TaskError('现在没有连接数据库，不能使用这个功能', 400)
  return store
}

/** 屏蔽：雙方互相看不到、不能再開新對話；進行中的對話結束。 */
socialRoutes.post('/safety/block', (c) =>
  respond(c, async (userId) => {
    const body = targetBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) throw new TaskError('请选择要屏蔽的用户')
    return blockUser(userId, body.data.userId, safetyStore())
  }),
)

socialRoutes.post('/safety/unblock', (c) =>
  respond(c, async (userId) => {
    const body = targetBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) throw new TaskError('请选择要取消屏蔽的用户')
    await unblockUser(userId, body.data.userId, safetyStore())
    return { userId: body.data.userId }
  }),
)

/** 檢舉：記下理由並自動屏蔽；真人被多人檢舉先從大廳隱藏。 */
socialRoutes.post('/safety/report', (c) =>
  respond(c, async (userId) => {
    const body = reportBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) throw new TaskError('请选择检举原因（补充说明 200 字以内）')
    return reportUser(userId, body.data.userId, body.data, safetyStore())
  }),
)

/** 我屏蔽的人（設定頁）。 */
socialRoutes.get('/safety/blocks', (c) => respond(c, (userId) => listMyBlocks(userId, safetyStore())))

// ===== 新手引導（server/social/onboarding.ts） =====
const quickProfileBody = z.object({
  intro: z.string().max(40),
  interests: z.array(z.string().max(30)).max(12),
  looking_for: z.string().max(60),
})

/** 引導進度（每一步完成沒有、現在該做哪一步）。 */
socialRoutes.get('/onboarding', (c) => respond(c, async (userId) => onboardingView(await loadOnboardingState(userId))))

/** 快速建檔：三個問題生成對外檔案（同時確認檔案）。 */
socialRoutes.post('/onboarding/quick-profile', (c) =>
  respond(c, async (userId) => {
    const body = quickProfileBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) throw new TaskError('介绍 40 字内、兴趣每个 30 字内、想找的人 60 字内')
    await updateShareable(userId, normalizeQuickProfile(body.data))
    return onboardingView(await loadOnboardingState(userId))
  }),
)

/** 進大廳：檔案夠完整就確認檔案＋開社交 Agent（不用等聊滿 LOBBY_INVITE_MIN_MESSAGES 句）。 */
socialRoutes.post('/onboarding/join-lobby', (c) =>
  respond(c, async (userId) => {
    const state = await loadOnboardingState(userId)
    if (!isProfileComplete(state.shareable)) throw new TaskError('先生成你的档案（一句介绍＋至少 2 个兴趣）')
    await supabaseLobbyInviteDeps().join(userId, state.shareable)
    return onboardingView(await loadOnboardingState(userId))
  }),
)

/** 第一個任務：用第一個興趣找 1 位（建立後是待確認，前端跳確認卡）。 */
socialRoutes.post('/onboarding/first-task', (c) =>
  respond(c, async (userId) => {
    const state = await loadOnboardingState(userId)
    return createTaskFromText(userId, firstTaskText(state.shareable))
  }),
)
