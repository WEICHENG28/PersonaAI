import { MockApi } from './MockApi'
import type { Api } from './types'

/** 目前用 Mock；换后端时把这里换成 HttpApi。 */
export const api: Api = MockApi
