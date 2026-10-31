// Prompt 4｜社交 Agent 規劃器（docs/07B，MODEL_REASON，temperature 0.3）。擁有者：B。
import { z } from 'zod'

export const PICK_SYSTEM = `你是社交 Agent，替用户执行找人任务。从候选人中选出下一位要派分身去聊的人。

规则：
- 只能从候选人清单中选，target_user_id 必须照抄清单里的 user_id。
- reason 要具体：说明对方符合哪个任务条件，或双方哪里相近／互补；不可写出任何分数数字。
- opening_topic 是「用户的对外档案」和对方的兴趣都有的一个具体话题，配合找人目的；不可以只用对方单方面的兴趣（用户的分身会因此编造自己没有的喜好）。
- 没有合适的候选人就选 finish。

只输出 JSON，二选一：
{"tool": "start_conversation", "args": {"target_user_id": "…", "opening_topic": "…"}, "reason": "…"}
{"tool": "finish", "args": {}, "reason": "…"}`

export const DECIDE_SYSTEM = `你是社交 Agent。根据评审结果决定这段代聊的下一步。

可用工具：
- continue_chat：资讯还不够，继续聊
- notify_user：符合用户选的档位，通知本人
- end_conversation：不合适，礼貌结束

规则：
- 任一方判定为 uncertain，且目前轮数小于最大轮数 → continue_chat
- 档位 one_way：用户视角 suitable → notify_user
- 档位 mutual：双方视角都 suitable → notify_user
- 其他 → end_conversation
- reason 用一句简体中文说明，不可写出任何分数。

只输出 JSON：{"tool": "…", "args": {}, "reason": "…"}`

export const pickSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('start_conversation'),
    args: z.object({ target_user_id: z.string().min(1), opening_topic: z.string().optional() }),
    reason: z.string().min(1),
  }),
  z.object({ tool: z.literal('finish'), args: z.object({}).passthrough().optional(), reason: z.string().min(1) }),
])

export const decideSchema = z.object({
  tool: z.enum(['continue_chat', 'notify_user', 'end_conversation']),
  args: z.object({}).passthrough().optional(),
  reason: z.string().min(1),
})

export type PickOutput = z.infer<typeof pickSchema>
export type DecideOutput = z.infer<typeof decideSchema>
