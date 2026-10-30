/** Demo 登录用：随机产生一个用户名称，例如「爱看展的小鹿」。 */

const TRAITS = ['爱看展的', '慢热的', '爱登山的', '夜猫子', '爱喝咖啡的', '会做饭的', '爱散步的', '追剧中的', '爱拍照的', '安静的']
const NAMES = ['小鹿', '海豚', '松鼠', '企鹅', '小狐', '团子', '橘猫', '刺猬', '水獭', '云雀']

export function randomName(random: () => number = Math.random): string {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)] ?? list[0]!
  return `${pick(TRAITS)}${pick(NAMES)}`
}
