import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// The review screen is loaded on demand (lazy route), which can take over a second on a
// busy machine when every test file runs in parallel; the default 1 s wait was flaky.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => cleanup())
