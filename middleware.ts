import createIntlMiddleware from 'next-intl/middleware'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'
import { getPublicEnv } from '@/lib/env'

const handleI18nRouting = createIntlMiddleware(routing)

/** Pathnames that don't require a signed-in user. */
function isPublicPath(pathname: string): boolean {
  const stripped = pathname.replace(/^\/(zh-HK|en)(?=\/|$)/, '')
  return (
    stripped === '/login' ||
    stripped.startsWith('/api/auth') ||
    stripped.startsWith('/auth')
  )
}

/** Locale of the current request, inferred from the URL prefix. */
function localeOf(pathname: string): string {
  const match = routing.locales.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  )
  return match ?? routing.defaultLocale
}

function localizedPath(locale: string, path: string): string {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`
}

export async function middleware(request: NextRequest) {
  const intlResponse = handleI18nRouting(request)
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        cookiesToSet.forEach(({ name, value, options }) =>
          intlResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = localizedPath(localeOf(pathname), '/login')
    loginUrl.search = ''
    const redirect = NextResponse.redirect(loginUrl)
    intlResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  if (user && isPublicPath(pathname) && !pathname.startsWith('/api')) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = localizedPath(localeOf(pathname), '/friend')
    homeUrl.search = ''
    const redirect = NextResponse.redirect(homeUrl)
    intlResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return intlResponse
}

export const config = {
  // Skip Next internals and static files; API routes handle their own auth.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
