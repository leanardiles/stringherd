import { createContext, useContext } from 'react'

export const OpenShortcuts = createContext<() => void>(() => {})

/** Opens the keyboard shortcuts reference (toolbar icon, account menu, footer link). */
export function useShowShortcuts() {
  return useContext(OpenShortcuts)
}
