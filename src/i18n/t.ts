import strings from '../../messages/strings.json'

type Vars = Record<string, string | number>

/**
 * 单语言（简体中文）字串查找。
 * key 用 dot path（"friend.title"），支持 {{var}} 插值。
 * 找不到时回传 key 本身，方便发现漏字。
 */
export function t(key: string, vars?: Vars): string {
  const raw = lookup(key)
  if (!vars) return raw
  return raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{{${name}}}`,
  )
}

function lookup(key: string): string {
  let node: unknown = strings
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return key
    }
  }
  return typeof node === 'string' ? node : key
}
