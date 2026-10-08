import { QueryCache, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  ApiError,
  type ReviewEdit,
  type ReviewProject,
  type ReviewString,
  type ReviewStringPage,
  type User,
} from './client'

export const queryKeys = {
  me: ['me'] as const,
  reviewProjects: ['review', 'projects'] as const,
  reviewStrings: (projectId: string, locale: string) => ['review', 'strings', projectId, locale] as const,
}

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
