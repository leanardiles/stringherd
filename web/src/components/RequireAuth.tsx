import { Navigate, Outlet, useLocation } from 'react-router'
import { ApiError } from '../api/client'
import { useMe } from '../api/queries'
import { LoadError, Loading } from './StatusMessage'

/** Shows the page only to signed-in users; everyone else goes to sign-in and comes back afterwards. */
export function RequireAuth() {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) return <Loading />
  if (me.isError) {
    return <LoadError onRetry={() => void me.refetch()} unreachable={me.error instanceof ApiError && me.error.unreachable} />
  }
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
