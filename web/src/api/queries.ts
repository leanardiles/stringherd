import { QueryCache, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  ApiError,
  PASSWORD_CHANGE_REQUIRED,
  type ApiKey,
  type ApiKeyIssued,
  type BulkApproveResult,
  type BulkWithdrawResult,
  type DeliveryResult,
  type PasswordChange,
  type ProjectAdmin,
  type ProjectAdminDetail,
  type ProjectCreate,
  type ProjectSetup,
  type ProjectUpdate,
  type ReviewEdit,
  type ReviewProject,
  type ReviewString,
  type ReviewStringPage,
  type TemporaryPassword,
  type User,
  type UserCreate,
  type UserCreated,
  type UserUpdate,
} from './client'

export const queryKeys = {
  me: ['me'] as const,
  reviewProjects: ['review', 'projects'] as const,
  reviewStrings: (projectId: string, locale: string) => ['review', 'strings', projectId, locale] as const,
  adminProjects: ['admin', 'projects'] as const,
  adminProject: (projectId: string) => ['admin', 'projects', projectId] as const,
  adminSetup: (projectId: string) => ['admin', 'projects', projectId, 'setup'] as const,
  adminUsers: ['admin', 'users'] as const,
}

const projectPath = (projectId: string) => `/api/admin/projects/${encodeURIComponent(projectId)}`

const PAGE_SIZE = 500

function stringsPath(projectId: string, locale: string): string {
  return `/api/review/projects/${encodeURIComponent(projectId)}/locales/${encodeURIComponent(locale)}/strings`
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      // Session expired or revoked while working: forget the user so the app goes to sign-in.
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) client.setQueryData(queryKeys.me, null)
        // An admin reset the password while this user was working: reload who they are,
        // so the app shows the change-password page.
        if (error instanceof ApiError && error.status === 403 && error.detail === PASSWORD_CHANGE_REQUIRED) {
          void client.invalidateQueries({ queryKey: queryKeys.me })
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  })
  return client
}

/** The signed-in user, or null when nobody is signed in. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<User | null> => {
      try {
        return await api<User>('/api/auth/me')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 5 * 60_000,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api<User>('/api/auth/login', { method: 'POST', json: credentials }),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(queryKeys.me, null)
    },
  })
}

export function useReviewProjects() {
  return useQuery({
    queryKey: queryKeys.reviewProjects,
    queryFn: () => api<ReviewProject[]>('/api/review/projects'),
  })
}

/** Every string of one project and language, loaded page by page; filtering happens in the browser. */
export function useReviewStrings(projectId: string, locale: string) {
  return useQuery({
    queryKey: queryKeys.reviewStrings(projectId, locale),
    queryFn: async (): Promise<ReviewString[]> => {
      const items: ReviewString[] = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await api<ReviewStringPage>(`${stringsPath(projectId, locale)}?limit=${PAGE_SIZE}&offset=${offset}`)
        items.push(...page.items)
        if (items.length >= page.total || page.items.length === 0) return items
      }
    },
    staleTime: 60_000,
  })
}

type EditVariables = { key: string; edit: ReviewEdit }

/**
 * Edit, approve or withdraw one string. The list updates immediately (optimistic)
 * and rolls back if the server refuses.
 */
export function useEditString(projectId: string, locale: string) {
  const queryClient = useQueryClient()
  const listKey = queryKeys.reviewStrings(projectId, locale)

  return useMutation({
    mutationFn: ({ key, edit }: EditVariables) =>
      api<ReviewString>(`${stringsPath(projectId, locale)}/${key.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'PATCH',
        json: edit,
      }),
    onMutate: async ({ key, edit }) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<ReviewString[]>(listKey)
      queryClient.setQueryData<ReviewString[]>(listKey, (items) =>
        items?.map((item) => {
          if (item.key !== key) return item
          const value = edit.value ?? item.value
          const changed = value !== item.value
          let status = item.status
          if (edit.approved === true) status = 'approved'
          else if (edit.approved === false || changed) status = 'machine_translated'
          return { ...item, value, status, approved_by: status === 'approved' ? item.approved_by : null }
        }),
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous)
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<ReviewString[]>(listKey, (items) => items?.map((item) => (item.key === saved.key ? saved : item)))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.reviewProjects }),
  })
}

/**
 * Approve or withdraw several strings at once. The list updates from the server's answer
 * (skipped strings keep their status), then reloads in the background for exact details.
 */
export function useBulkReview(projectId: string, locale: string, approverName: string) {
  const queryClient = useQueryClient()
  const listKey = queryKeys.reviewStrings(projectId, locale)
  const settle = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewProjects }),
    ])

  const approve = useMutation({
    mutationFn: (keys: string[]) =>
      api<BulkApproveResult>(`${stringsPath(projectId, locale)}/approve`, { method: 'POST', json: { keys } }),
    onSuccess: (result, keys) => {
      const skipped = new Set(result.skipped.map((s) => s.key))
      queryClient.setQueryData<ReviewString[]>(listKey, (items) =>
        items?.map((item) =>
          keys.includes(item.key) && !skipped.has(item.key) && item.status === 'machine_translated'
            ? { ...item, status: 'approved', approved_by: approverName }
            : item,
        ),
      )
    },
    onSettled: settle,
  })

  const withdraw = useMutation({
    mutationFn: (keys: string[]) =>
      api<BulkWithdrawResult>(`${stringsPath(projectId, locale)}/withdraw`, { method: 'POST', json: { keys } }),
    onSuccess: (_result, keys) => {
      queryClient.setQueryData<ReviewString[]>(listKey, (items) =>
        items?.map((item) =>
          keys.includes(item.key) && item.status === 'approved'
            ? { ...item, status: 'machine_translated', approved_by: null, approved_at: null }
            : item,
        ),
      )
    },
    onSettled: settle,
  })

  return { approve, withdraw }
}

/** Deliver a language: its approved strings become pullable and locked. */
export function useDeliver(projectId: string, locale: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<DeliveryResult>(
        `/api/review/projects/${encodeURIComponent(projectId)}/locales/${encodeURIComponent(locale)}/deliver`,
        { method: 'POST' },
      ),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.reviewStrings(projectId, locale) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reviewProjects }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adminProjects }),
      ]),
  })
}

/** Unlock a delivered string so it can be corrected (admins). */
export function useReopenString(projectId: string, locale: string) {
  const queryClient = useQueryClient()
  const listKey = queryKeys.reviewStrings(projectId, locale)
  return useMutation({
    mutationFn: (key: string) =>
      api<ReviewString>(`${stringsPath(projectId, locale)}/${key.split('/').map(encodeURIComponent).join('/')}/reopen`, {
        method: 'POST',
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData<ReviewString[]>(listKey, (items) => items?.map((item) => (item.key === saved.key ? saved : item)))
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviewProjects })
    },
  })
}

/** Change your own password; required while it is a temporary one. */
export function useChangePassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: PasswordChange) => api<User>('/api/auth/password', { method: 'POST', json: body }),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  })
}

// ---------- Administration: projects ----------

export function useAdminProjects() {
  return useQuery({ queryKey: queryKeys.adminProjects, queryFn: () => api<ProjectAdmin[]>('/api/admin/projects') })
}

export function useAdminProject(projectId: string) {
  return useQuery({ queryKey: queryKeys.adminProject(projectId), queryFn: () => api<ProjectAdminDetail>(projectPath(projectId)) })
}

export function useProjectSetup(projectId: string) {
  return useQuery({
    queryKey: queryKeys.adminSetup(projectId),
    queryFn: () => api<ProjectSetup>(`${projectPath(projectId)}/setup`),
    staleTime: Infinity,
  })
}

/** After any project change: store the fresh detail and refresh the lists that show projects. */
function useProjectSaved() {
  const queryClient = useQueryClient()
  return (project: ProjectAdminDetail) => {
    queryClient.setQueryData(queryKeys.adminProject(project.project_id), project)
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminProjects, exact: true })
    void queryClient.invalidateQueries({ queryKey: queryKeys.reviewProjects })
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers })
  }
}

export function useCreateProject() {
  const saved = useProjectSaved()
  return useMutation({
    mutationFn: (body: ProjectCreate) => api<ProjectAdminDetail>('/api/admin/projects', { method: 'POST', json: body }),
    onSuccess: saved,
  })
}

export function useUpdateProject(projectId: string) {
  const saved = useProjectSaved()
  return useMutation({
    mutationFn: (body: ProjectUpdate) => api<ProjectAdminDetail>(projectPath(projectId), { method: 'PATCH', json: body }),
    onSuccess: saved,
  })
}

export function useAddLocale(projectId: string) {
  const saved = useProjectSaved()
  return useMutation({
    mutationFn: (locale: string) =>
      api<ProjectAdminDetail>(`${projectPath(projectId)}/locales`, { method: 'POST', json: { locale } }),
    onSuccess: saved,
  })
}

export function useRemoveLocale(projectId: string) {
  const saved = useProjectSaved()
  return useMutation({
    mutationFn: (locale: string) =>
      api<ProjectAdminDetail>(`${projectPath(projectId)}/locales/${encodeURIComponent(locale)}`, { method: 'DELETE' }),
    onSuccess: saved,
  })
}

export function useCreateKey(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (label: string) => api<ApiKeyIssued>(`${projectPath(projectId)}/keys`, { method: 'POST', json: { label } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminProjects }),
  })
}

export function useRevokeKey(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (keyId: number) => api<ApiKey>(`${projectPath(projectId)}/keys/${keyId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminProjects }),
  })
}

// ---------- Administration: people ----------

const userPath = (userId: number) => `/api/admin/users/${userId}`

export function useAdminUsers() {
  return useQuery({ queryKey: queryKeys.adminUsers, queryFn: () => api<User[]>('/api/admin/users') })
}

/** After any change to a person: refresh the people list and the per-language reviewer lists. */
function useUserSaved() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers })
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminProjects })
  }
}

export function useCreateUser() {
  const saved = useUserSaved()
  return useMutation({
    mutationFn: (body: UserCreate) => api<UserCreated>('/api/admin/users', { method: 'POST', json: body }),
    onSuccess: saved,
  })
}

export function useUpdateUser(userId: number) {
  const saved = useUserSaved()
  return useMutation({
    mutationFn: (body: UserUpdate) => api<User>(userPath(userId), { method: 'PATCH', json: body }),
    onSuccess: saved,
  })
}

export function useResetPassword(userId: number) {
  const saved = useUserSaved()
  return useMutation({
    mutationFn: () => api<TemporaryPassword>(`${userPath(userId)}/reset-password`, { method: 'POST' }),
    onSuccess: saved,
  })
}

export function useAddAssignment(userId: number) {
  const saved = useUserSaved()
  return useMutation({
    mutationFn: (body: { project_id: string; locale: string }) =>
      api<User>(`${userPath(userId)}/assignments`, { method: 'POST', json: body }),
    onSuccess: saved,
  })
}

export function useRemoveAssignment(userId: number) {
  const saved = useUserSaved()
  return useMutation({
    mutationFn: ({ project_id, locale }: { project_id: string; locale: string }) =>
      api<User>(`${userPath(userId)}/assignments/${encodeURIComponent(project_id)}/${encodeURIComponent(locale)}`, {
        method: 'DELETE',
      }),
    onSuccess: saved,
  })
}
