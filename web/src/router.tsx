import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { ProjectsPage } from './pages/ProjectsPage'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <ProjectsPage /> },
          {
            path: '/review/:projectId/:locale',
            // Loaded on demand: the editor (CodeMirror) is only needed on this screen.
            lazy: async () => ({ Component: (await import('./pages/ReviewPage')).ReviewPage }),
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]

export function createRouter() {
  return createBrowserRouter(routes)
}
