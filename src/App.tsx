import { AppShell } from '@components/AppShell'

export function App({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
