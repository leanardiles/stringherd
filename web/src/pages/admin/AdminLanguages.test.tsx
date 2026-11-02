import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LanguageImport, ProjectAdminDetail, ProjectLocaleAdmin } from '../../api/client'
import { ADMIN, renderApp } from '../../test/renderApp'

afterEach(() => vi.unstubAllGlobals())

const FILE = 'web-react/src/i18n/locales/en/common.json'
const FRENCH: ProjectLocaleAdmin = {
  locale: 'fr',
  total: 255,
  approved: 0,
  delivered: 255,
  last_delivered_at: '2026-10-16T10:00:00Z',
  reviewers: [{ id: 1, name: 'Ana Admin' }],
  existing_translations: null,
}

function project(...extra: ProjectLocaleAdmin[]): ProjectAdminDetail {
  const locales = [FRENCH, ...extra]
  return {
    project_id: 'fitjournal',
    name: 'FitJournal',
    source_locale: 'en',
    target_locales: locales.map((locale) => locale.locale),
    strings: 255,
    locales,
    active_keys: 1,
    created_at: '2026-10-01T10:00:00Z',
    api_keys: [],
  }
}

function dutch(state: Partial<LanguageImport>, total = 0): ProjectLocaleAdmin {
  return {
    locale: 'nl',
    total,
    approved: 0,
    delivered: 0,
    last_delivered_at: null,
    reviewers: [],
    existing_translations: {
      mode: 'review',
      started_at: '2026-11-01T10:00:00Z',
      finished_at: null,
      importing: true,
      imported: 0,
      files: [],
      estimated_characters: null,
      ...state,
    },
  }
}

const SETUP = { server_url: 'http://localhost:8100', project_id: 'fitjournal', deepl_sync_yaml: '', commands: '' }
const PAGE = '/admin/projects/fitjournal'
const API = '/api/admin/projects/fitjournal'

function open(detail: ProjectAdminDetail, more: (url: string, init?: RequestInit) => { status: number; body?: unknown } | undefined = () => undefined) {
  return renderApp(PAGE, (url, init) => {
    const answer = more(url, init)
    if (answer) return answer
    if (url === '/api/auth/me') return { status: 200, body: ADMIN }
    if (url === API) return { status: 200, body: detail }
    if (url === `${API}/setup`) return { status: 200, body: SETUP }
    if (url === '/api/admin/projects') return { status: 200, body: [detail] }
    return { status: 404 }
  })
}

function body(fetch: ReturnType<typeof open>['fetch'], url: string, method: string) {
  const call = fetch.mock.calls.find(([u, init]) => u === url && init?.method === method)
  return call ? JSON.parse(String(call[1]?.body ?? 'null')) : undefined
}

describe('adding a language', () => {
  it('picks a DeepL language and asks about existing translations', async () => {
    const { fetch } = open(project(), (url, init) =>
      url === `${API}/locales` && init?.method === 'POST' ? { status: 201, body: project(dutch({})) } : undefined,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Add language' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a language' })
    expect(within(dialog).getByRole('button', { name: 'Add language' })).toBeDisabled()

    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Language' }), 'dutch')
    expect(within(dialog).getAllByRole('option')[0]).toHaveTextContent('Dutch (nl)')
    await userEvent.keyboard('{Enter}')

    expect(within(dialog).getByText('Dutch (nl)')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByLabelText(/Yes, keep them for review/))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add language' }))

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(body(fetch, `${API}/locales`, 'POST')).toEqual({ locale: 'nl', import_mode: 'review' })
  })

  it('without existing translations, sends no answer', async () => {
    const { fetch } = open(project(), (url, init) =>
      url === `${API}/locales` && init?.method === 'POST' ? { status: 201, body: project() } : undefined,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Add language' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('combobox'), 'nl')
    await userEvent.keyboard('{Enter}')
    expect(within(dialog).getByLabelText(/^No/)).toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add language' }))
    await vi.waitFor(() => expect(body(fetch, `${API}/locales`, 'POST')).toEqual({ locale: 'nl', import_mode: null }))
  })

  it('marks languages that cannot be added, and offers a code DeepL lacks', async () => {
    open(project())
    await userEvent.click(await screen.findByRole('button', { name: 'Add language' }))
    const dialog = await screen.findByRole('dialog')
    const search = within(dialog).getByRole('combobox')

    await userEvent.type(search, 'french')
    const french = within(dialog).getAllByRole('option').find((option) => option.textContent?.startsWith('French (fr)'))
    expect(french).toHaveAttribute('aria-disabled', 'true')
    expect(french).toHaveTextContent('Already added')

    await userEvent.clear(search)
    await userEvent.type(search, 'es-AR')
    expect(within(dialog).getByRole('option', { name: /Use the code es-AR/ })).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(within(dialog).getByText(/Not one of DeepL's languages/)).toBeInTheDocument()
  })
})

describe('importing a language', () => {
  it('shows the steps while the import waits for the push', async () => {
    open(project(dutch({})))
    const languages = await screen.findByRole('region', { name: 'Languages' })
    expect(await within(languages).findByText('Waiting for import')).toBeInTheDocument()
    expect(within(languages).getByLabelText('Push command for Dutch (nl)')).toHaveTextContent('deepl sync push --locale nl')
    expect(within(languages).getByText(/Don't run deepl sync until the import is finished/)).toBeInTheDocument()
    expect(within(languages).getByText(/with the project's key in TMS_API_KEY/)).toBeInTheDocument()
    expect(within(languages).getByRole('button', { name: 'Finish import' })).toBeDisabled()
  })

  it('counts what arrived per file, then finishes and shows the pull', async () => {
    const arrived = dutch({ imported: 254, files: [{ file: FILE, strings: 254, keys: 255 }] }, 254)
    const finished = dutch({ imported: 254, importing: false, finished_at: '2026-11-01T11:00:00Z', files: arrived.existing_translations!.files }, 254)
    const { fetch } = open(project(arrived), (url, init) =>
      url === `${API}/locales/nl/import/finish` && init?.method === 'POST' ? { status: 200, body: project(finished) } : undefined,
    )
    const languages = await screen.findByRole('region', { name: 'Languages' })
    expect(await within(languages).findByText('Waiting for import')).toBeInTheDocument()
    expect(within(languages).getByText(/254 of 255 keys/)).toBeInTheDocument()

    await userEvent.click(within(languages).getByRole('button', { name: 'Finish import' }))
    const confirm = await screen.findByRole('dialog', { name: 'Finish the Dutch (nl) import?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Finish import' }))

    const pull = await screen.findByRole('dialog', { name: 'Dutch (nl) is imported' })
    expect(within(pull).getByLabelText('Pull command for Dutch (nl)')).toHaveTextContent('deepl sync pull --locale nl')
    expect(fetch.mock.calls.some(([url]) => url === `${API}/locales/nl/import/finish`)).toBe(true)
    await userEvent.click(within(pull).getByRole('button', { name: 'Done' }))
    expect(within(languages).getByText(/Imported 254 strings from the repository/)).toBeInTheDocument()
    // Imported for review: the code has the text already, so progress counts what has been reviewed.
    expect(within(languages).getByText('0 of 254 reviewed')).toBeInTheDocument()
    expect(within(languages).queryByText('Not delivered yet')).not.toBeInTheDocument()
    expect(within(languages).queryByRole('button', { name: 'Finish import' })).not.toBeInTheDocument()
  })

  it('translating again shows the cost and the commands, and the answer can change', async () => {
    const german = { ...dutch({ mode: 'retranslate', importing: false, started_at: null, estimated_characters: 4825 }), locale: 'de' }
    const { fetch } = open(project(german), (url, init) =>
      url === `${API}/locales/de` && init?.method === 'PATCH' ? { status: 200, body: project(german) } : undefined,
    )
    const languages = await screen.findByRole('region', { name: 'Languages' })
    expect(await within(languages).findByText('Waiting for DeepL')).toBeInTheDocument()
    expect(within(languages).getByText(/costs about 4,825 characters/)).toBeInTheDocument()
    expect(within(languages).getByLabelText('Translate command for German (de)')).toHaveTextContent('deepl sync --force --locale de')

    await userEvent.click(within(languages).getByRole('button', { name: 'Change the answer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Existing German (de) translations' })
    expect(within(dialog).getByLabelText(/Yes, translate them again/)).toBeChecked()
    await userEvent.click(within(dialog).getByLabelText(/Yes, keep them as reviewed/))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(body(fetch, `${API}/locales/de`, 'PATCH')).toEqual({ import_mode: 'reviewed' }))
  })
})
