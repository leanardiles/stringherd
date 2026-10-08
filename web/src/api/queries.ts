import { QueryCache, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, type ReviewProject, type User } from './client'

export const queryKeys = {
  me: ['me'] as const,
  reviewProjects: ['review', 'projects'] as const,
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
