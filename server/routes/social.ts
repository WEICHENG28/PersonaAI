// B 線的 API 路由，掛在 /api 底下（例如 socialRoutes.get('/xxx') → GET /api/xxx）。擁有者：B。
// 回應格式：成功 { ok: true, data }，失敗 { ok: false, error: '给用户看的简体中文讯息' }。
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { LlmError } from '../lib/llm'
import { TaskError, changeTaskStatus, createTaskFromText, getOwnTask, type TaskAction } from '../social/task'
import { requireUserId } from '../social/user'

export const socialRoutes = new Hono()

const createBody = z.object({ text: z.string().trim().min(1).max(200) })

socialRoutes.post('/tasks', async (c) => {
  const body = createBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false, error: '请用一句话说说想找什么样的人（200 字以内）' }, 400)
  return respond(c, () => createTaskFromText(requireUserId(c), body.data.text))
})

socialRoutes.get('/tasks/:id', (c) => respond(c, () => getOwnTask(requireUserId(c), c.req.param('id'))))

for (const action of ['confirm', 'pause', 'resume', 'cancel'] as const satisfies TaskAction[]) {
  socialRoutes.post(`/tasks/:id/${action}`, (c) =>
    respond(c, () => changeTaskStatus(requireUserId(c), c.req.param('id'), action)),
  )
}

/** TaskError 原樣回給用戶；LLM 失敗換成好懂的訊息；其他錯誤交給 app.onError。 */
async function respond<T>(c: Context, run: () => Promise<T>) {
  try {
    return c.json({ ok: true, data: await run() })
  } catch (err) {
    if (err instanceof TaskError) return c.json({ ok: false, error: err.message }, err.status)
    if (err instanceof LlmError) {
      console.error('[social]', err)
      return c.json({ ok: false, error: 'AI 暂时没有回应，请稍后再试' }, 503)
    }
    throw err
  }
}
