/** 兴趣输入拆成列表：可以用逗号、顿号或空格分隔（UX #3：原本正则把 \s 写成 s，会切烂英文单字）。 */
export function splitInterests(text: string): string[] {
  return text
    .split(/[、,，\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}
