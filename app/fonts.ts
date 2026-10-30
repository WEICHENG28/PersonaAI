import { Noto_Sans_SC, Noto_Sans_TC } from 'next/font/google'

/**
 * Chinese round-feel body fonts. Chillax (latin display) will be added as a
 * local font file later; the CSS var chain in globals.css already reserves
 * its slot (07 §8.1).
 */
export const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  variable: '--font-noto-sans-sc',
  display: 'swap',
})

export const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  variable: '--font-noto-sans-tc',
  display: 'swap',
})
