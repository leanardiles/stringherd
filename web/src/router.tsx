import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppShell } from './components/AppShell'
import { RequireAdmin } from './components/RequireAdmin'
import { RequireAuth } from './components/RequireAuth'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { LoginPage } from './pages/LoginPage'
import { ProjectsPage } from './pages/ProjectsPage'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/password', element: <ChangePasswordPage /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <ProjectsPage /> },
          {
            path: '/review/:projectId/:locale',
            // Loaded on demand: the editor (CodeMirror) is only needed on this screen.
            lazy: async () => ({ Component: (await import('./pages/ReviewPage')).ReviewPage }),
          },
          {
            // Loaded on demand, like the review screen: most people who sign in are reviewers.
            path: '/admin',
            element: <RequireAdmin />,
            children: [
              { index: true, element: <Navigate to="/admin/projects" replace /> },
              { path: 'projects', lazy: async () => ({ Component: (await import('./pages/admin/AdminProjectsPage')).AdminProjectsPage }) },
              { path: 'projects/:projectId', lazy: async () => ({ Component: (await import('./pages/admin/AdminProjectPage')).AdminProjectPage }) },
              { path: 'people', lazy: async () => ({ Component: (await import('./pages/admin/AdminPeoplePage')).AdminPeoplePage }) },
              { path: 'people/:userId', lazy: async () => ({ Component: (await import('./pages/admin/AdminPersonPage')).AdminPersonPage }) },
            ],
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
