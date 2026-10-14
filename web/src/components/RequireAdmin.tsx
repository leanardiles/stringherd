import { Outlet } from 'react-router'
import { useMe } from '../api/queries'
import { NotFound } from './StatusMessage'

/** Administration pages. Reviewers get the same answer as for a page that doesn't exist. */
export function RequireAdmin() {
  const { data: user } = useMe()
  if (user?.role !== 'admin') return <NotFound />
  return <Outlet />
}
