import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { routes } from './routes'
import '@theme/base.css'
import { installErrorReporting } from '@lib/errorReport'

// 錯誤監測：網頁上沒接住的錯誤回報給後端（只在 http 模式）
installErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* basename：部署到 GitHub Pages 時網址在 /PersonaAI/ 底下；本機是 / */}
    <RouterProvider router={createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })} />
  </StrictMode>,
)
