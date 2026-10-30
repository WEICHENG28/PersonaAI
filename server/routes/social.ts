// B 線的 API 路由，掛在 /api 底下（例如 socialRoutes.get('/xxx') → GET /api/xxx）。擁有者：B。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { LlmError } from '../lib/llm'
import { TaskError, changeTaskStatus, createTaskFromText, getOwnTask, type TaskAction } from '../social/task'
import { startConversation } from '../contracts/twin'
import { getAgentStore } from '../social/agentStore'
import { listHistory, reopenAttempt } from '../social/history'
import { runTaskStepSafely } from '../social/runner'
import { defaultRunnerDeps } from '../social/runnerDeps'
import { requireUserId } from '../social/user'

export const socialRoutes = new Hono()

const createBody = z.object({ text: z.string().trim().min(1).max(200) })

socialRoutes.post('/tasks', async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false, error: '请用一句话说说想找什么样的人（200 字以内）' }, 400)
  return respond(c, (userId) => createTaskFromText(userId, body.data.text))
})

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
socialRoutes.post('/history/:id/reopen', async (c) => {
  const body = reopenBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false, error: '请选择本人去聊或直接请求真人' }, 400)
  return respond(c, (userId) => reopenAttempt(userId, c.req.param('id'), body.data.mode, { store: getAgentStore(), startConversation }))
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
