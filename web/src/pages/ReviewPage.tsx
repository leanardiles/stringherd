import { Keyboard, Pilcrow, Send } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError, type ReviewEdit } from '../api/client'
import {
  useBulkReview,
  useDeliver,
  useEditString,
  useMe,
  useReopenString,
  useReviewProjects,
  useReviewStrings,
} from '../api/queries'
import type { TargetEditorHandle } from '../components/editor/TargetEditor'
import { ProgressBar } from '../components/ProgressBar'
import { BulkBar } from '../components/review/BulkBar'
import { ContextPanel } from '../components/review/ContextPanel'
import { DeliverDialog } from '../components/review/DeliverDialog'
import { GoToDialog } from '../components/review/GoToDialog'
import { ShowInvisiblesContext } from '../components/invisibles'
import { useShowShortcuts } from '../components/shortcuts/context'
import { KeyList } from '../components/review/KeyList'
import reviewStyles from '../components/review/Review.module.css'
import { StringCard } from '../components/review/StringCard'
import { StringEditor, type StringEditorProps } from '../components/review/StringEditor'
import { StringRow } from '../components/review/StringRow'
import { LoadError, Loading } from '../components/StatusMessage'
import ui from '../components/ui.module.css'
import { errorMessage } from '../lib/errors'
import { missingPlaceholders } from '../lib/placeholders'
import { displayKeys, matchShortcut, shortcut, type ShortcutId } from '../lib/shortcuts'
import { formatPercent, languageLabel } from '../lib/languages'
import { checkTranslation, qaLevel } from '../lib/qa'
import {
  countByFilter,
  isSelectable,
  keyRange,
  matchesFilter,
  matchesQuery,
  neighbourKey,
  summarizeSelection,
  type StatusFilter,
} from '../lib/review'
import styles from './ReviewPage.module.css'

const FILTERS: StatusFilter[] = ['all', 'review', 'approved', 'delivered']
type View = 'single' | 'list'
const VIEW_STORAGE_KEY = 'stringherd.reviewView'
const INVISIBLES_STORAGE_KEY = 'stringherd.showInvisibles'

function rememberedInvisibles(): boolean {
  try {
    return localStorage.getItem(INVISIBLES_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Pane focus order for Ctrl+Alt+← and →: key list or rows, editor, context panel. */
function panes(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-pane]')]
}

function rememberedView(): View {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'single'
  } catch {
    return 'single'
  }
}

export function ReviewPage() {
  const { t } = useTranslation()
  const { projectId = '', locale = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const filter: StatusFilter = FILTERS.includes(params.get('status') as StatusFilter)
    ? (params.get('status') as StatusFilter)
    : 'all'
  const query = params.get('q') ?? ''
  const activeKey = params.get('key')
  const viewParam = params.get('view')
  const view: View = viewParam === 'list' || viewParam === 'single' ? viewParam : rememberedView()

  const strings = useReviewStrings(projectId, locale)
  const projects = useReviewProjects()
  const edit = useEditString(projectId, locale)
  const deliver = useDeliver(projectId, locale)
  const reopen = useReopenString(projectId, locale)
  const { data: me } = useMe()
  const canReopen = me?.role === 'admin'
  const bulk = useBulkReview(projectId, locale, me?.name ?? '')
  // List view: strings checked for a bulk action, and the last one clicked (for Shift+click).
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const [showInvisibles, setShowInvisibles] = useState(rememberedInvisibles)
  const [goingTo, setGoingTo] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState(0)
  const showShortcuts = useShowShortcuts()
  const searchRef = useRef<HTMLInputElement>(null)
  const [delivering, setDelivering] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const sourceLang = projects.data?.find((p) => p.project_id === projectId)?.source_locale ?? 'en'

  // Strings that changed status while a filter is on stay visible until the filter changes,
  // so approving under "To review" does not make rows jump away.
  const [sticky, setSticky] = useState<ReadonlySet<string>>(new Set())
  const [draft, setDraft] = useState<{ key: string; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<TargetEditorHandle>(null)
  const cardRef = useRef<HTMLElement>(null)

  const items = useMemo(() => strings.data ?? [], [strings.data])
  const numbers = useMemo(() => new Map(items.map((item, i) => [item.key, i + 1])), [items])
  const visible = useMemo(
    () => items.filter((item) => matchesFilter(item, filter, query) || sticky.has(item.key)),
    [items, filter, query, sticky],
  )
  const visibleKeys = useMemo(() => visible.map((item) => item.key), [visible])
  // Only what is on screen and not locked counts, so a bulk action never reaches a hidden string.
  const selection = useMemo(
    () => new Set(visible.filter((item) => isSelectable(item) && selected.has(item.key)).map((item) => item.key)),
    [visible, selected],
  )
  const selectableKeys = useMemo(() => visible.filter(isSelectable).map((item) => item.key), [visible])
  const selectionSummary = useMemo(
    () => summarizeSelection(visible, selection, (item) => qaLevel(checkTranslation(item.source_text, item.value)) === 'error'),
    [visible, selection],
  )
  const active = activeKey ? items.find((item) => item.key === activeKey) ?? null : null
  const value = active ? (draft?.key === active.key ? draft.value : active.value) : ''
  const dirty = active !== null && value !== active.value
  const issues = useMemo(() => (active ? checkTranslation(active.source_text, value) : []), [active, value])

  const counts = countByFilter(items)
  const { approved, delivered } = counts
  // Delivered strings stay findable: say so when a search matches some that the filter hides.
  const hiddenDelivered =
    query.trim() && filter !== 'delivered'
      ? items.filter((item) => item.status === 'delivered' && matchesQuery(item, query)).length
      : 0

  function setParam(name: string, next: string | null) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (next === null || next === '') updated.delete(name)
        else updated.set(name, next)
        return updated
      },
      { replace: true },
    )
  }

  function save(key: string, change: ReviewEdit) {
    setSticky((current) => new Set(current).add(key))
    edit.mutate(
      { key, edit: change },
      { onError: (e) => setError(e instanceof ApiError && e.detail ? e.detail : t('review.saveFailed', { key })) },
    )
  }

  /** Leaving a string keeps its edit, unapproved, as CAT tools do. */
  function open(key: string | null) {
    if (key === activeKey) return
    if (active && dirty) save(active.key, { value })
    setDraft(null)
    setSelectedSuggestion(0)
    setError(null)
    setParam('key', key)
  }

  function approveAndNext() {
    if (!active || active.status === 'delivered') return
    if (qaLevel(issues) === 'error') {
      setError(t('review.qa.blocked'))
      return
    }
    save(active.key, dirty ? { value, approved: true } : { approved: true })
    setDraft(null)
    setError(null)
    const next = neighbourKey(visibleKeys, active.key, 1)
    setParam('key', next ?? (view === 'single' ? active.key : null))
  }

  function withdraw() {
    if (active && active.status === 'approved' && !dirty) save(active.key, { approved: false })
  }

  function discardOrClose() {
    if (dirty) {
      setDraft(null)
      setError(null)
    } else if (view === 'list') {
      open(null)
    }
  }

  function move(step: 1 | -1): boolean {
    const next = neighbourKey(visibleKeys, activeKey, step)
    if (next) open(next)
    return next !== null
  }

  /** Alt+↑ / Alt+↓: the nearest string in that direction that still needs review. */
  function moveToReview(step: 1 | -1) {
    const start = activeKey ? visibleKeys.indexOf(activeKey) : step === 1 ? -1 : visibleKeys.length
    for (let i = start + step; i >= 0 && i < visibleKeys.length; i += step) {
      if (visible[i].status === 'machine_translated') return open(visible[i].key)
    }
  }

  // Suggestions in order; today only DeepL's translation (suggestion 1). TM matches will join.
  const suggestions = active?.machine_translation != null ? [active.machine_translation] : []
  const editable = active !== null && active.status !== 'delivered'

  function insertSuggestion(number: number) {
    const text = suggestions[number - 1]
    if (editable && text !== undefined) editorRef.current?.replaceAll(text)
  }

  function insertText(text: string) {
    if (editable && text) editorRef.current?.insertText(text)
  }

  function filterBySelection() {
    const text = window.getSelection()?.toString().trim()
    if (!text) return
    clearSelection()
    setSticky(new Set())
    if (searchRef.current) searchRef.current.value = text
    setParam('q', text)
  }

  function focusPane(target: HTMLElement | undefined) {
    if (!target) return
    if (target.dataset.pane === 'editor' && editable) return editorRef.current?.focus()
    const row = target.querySelector<HTMLElement>('[aria-current="true"], button')
    ;(target.dataset.pane === 'list' && row ? row : target).focus()
  }

  function cyclePane(step: 1 | -1) {
    const all = panes()
    if (all.length === 0) return
    const current = all.findIndex((pane) => pane.contains(document.activeElement))
    focusPane(all[(current + step + all.length) % all.length])
  }

  function runShortcut(id: ShortcutId, digit?: number) {
    switch (id) {
      case 'approveNext':
        return approveAndNext()
      case 'withdraw':
        return withdraw()
      case 'discard':
        return discardOrClose()
      case 'copySource':
        return active?.source_text && editable ? editorRef.current?.replaceAll(active.source_text) : undefined
      case 'insertSuggestion':
        return insertSuggestion(digit ?? 1)
      case 'insertSelectedSuggestion':
        return insertSuggestion(selectedSuggestion + 1)
      case 'previousSuggestion':
        return setSelectedSuggestion((n) => Math.max(0, n - 1))
      case 'nextSuggestion':
        return setSelectedSuggestion((n) => Math.min(Math.max(suggestions.length - 1, 0), n + 1))
      case 'insertNextPlaceholder':
        return insertText(missingPlaceholders(active?.source_text ?? '', value)[0] ?? '')
      case 'insertAllPlaceholders':
        return insertText(missingPlaceholders(active?.source_text ?? '', value).join(''))
      case 'insertNbsp':
        return insertText('\u00a0')
      case 'previousToReview':
        return moveToReview(-1)
      case 'nextToReview':
        return moveToReview(1)
      case 'firstString':
        return visibleKeys.length ? open(visibleKeys[0]) : undefined
      case 'lastString':
        return visibleKeys.length ? open(visibleKeys[visibleKeys.length - 1]) : undefined
      case 'goTo':
        return setGoingTo(true)
      case 'filterBySelection':
        return filterBySelection()
      case 'previousPane':
        return cyclePane(-1)
      case 'nextPane':
        return cyclePane(1)
      case 'contextPanel':
        return focusPane(panes().find((pane) => pane.dataset.pane === 'context'))
      default:
        return undefined
    }
  }

  /** Ctrl+G: show the string even if the current filter or search hides it. */
  function goTo(key: string) {
    setGoingTo(false)
    const item = items.find((i) => i.key === key)
    if (item && !visibleKeys.includes(key)) {
      clearSelection()
      setSticky(new Set())
      if (searchRef.current) searchRef.current.value = ''
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          updated.delete('q')
          if (item.status === 'delivered') updated.set('status', 'delivered')
          else updated.delete('status')
          updated.set('key', key)
          return updated
        },
        { replace: true },
      )
      setDraft(null)
      return
    }
    open(key)
  }

  function toggleInvisibles() {
    setShowInvisibles((on) => {
      try {
        localStorage.setItem(INVISIBLES_STORAGE_KEY, String(!on))
      } catch {
        // private window: the choice lasts for this page only
      }
      return !on
    })
  }

  function clearSelection() {
    setSelected(new Set())
    anchor.current = null
  }

  function toggleSelected(key: string, range: boolean) {
    const turnOn = !selection.has(key)
    const keys = range && anchor.current ? keyRange(selectableKeys, anchor.current, key) : [key]
    setSelected((current) => {
      const next = new Set([...current].filter((k) => selectableKeys.includes(k)))
      for (const k of keys) {
        if (turnOn) next.add(k)
        else next.delete(k)
      }
      return next
    })
    anchor.current = key
  }

  function toggleAll() {
    if (selection.size === selectableKeys.length) clearSelection()
    else setSelected(new Set(selectableKeys))
  }

  /** An unsaved edit in the open string is saved first, unapproved, so bulk actions see it. */
  async function saveDraft(): Promise<boolean> {
    if (!active || !dirty) return true
    try {
      await edit.mutateAsync({ key: active.key, edit: { value } })
    } catch {
      return false
    }
    setDraft(null)
    return true
  }

  async function bulkApprove() {
    const keys = selectionSummary.approvable
    if (!(await saveDraft())) return
    setSticky((current) => new Set([...current, ...keys]))
    bulk.approve.mutate(keys, {
      onSuccess: (result) => {
        const skipped = result.skipped.map((s) => s.key)
        setSelected(new Set(skipped))
        anchor.current = null
        setNotice(
          [
            t('review.bulk.approved', { count: result.approved }),
            skipped.length ? t('review.bulk.skipped', { count: skipped.length }) : '',
          ]
            .filter(Boolean)
            .join(' '),
        )
      },
      onError: (e) => setError(errorMessage(e, t)),
    })
  }

  async function bulkWithdraw() {
    const keys = selectionSummary.withdrawable
    if (!(await saveDraft())) return
    setSticky((current) => new Set([...current, ...keys]))
    bulk.withdraw.mutate(keys, {
      onSuccess: (result) => {
        setSelected((current) => new Set([...current].filter((k) => !keys.includes(k))))
        setNotice(t('review.bulk.withdrawn', { count: result.withdrawn }))
      },
      onError: (e) => setError(errorMessage(e, t)),
    })
  }

  function setFilter(next: StatusFilter) {
    clearSelection()
    setSticky(new Set())
    setParam('status', next === 'all' ? null : next)
  }

  async function confirmDeliver() {
    // An unsaved edit is kept as an edit, never delivered: save it first, then deliver.
    if (active && dirty) {
      try {
        await edit.mutateAsync({ key: active.key, edit: { value } })
      } catch {
        return
      }
      setDraft(null)
    }
    deliver.mutate(undefined, {
      onSuccess: (result) => {
        setDelivering(false)
        setSticky(new Set())
        setNotice(t('review.deliver.done', { count: result.delivered }))
      },
    })
  }

  function reopenActive() {
    if (!active) return
    setError(null)
    setSticky((current) => new Set(current).add(active.key)) // stays in view under the Delivered filter
    reopen.mutate(active.key, { onError: (e) => setError(errorMessage(e, t)) })
  }

  function setView(next: View) {
    clearSelection()
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // private window: the choice lasts for this page only
    }
    setParam('view', next)
  }

  // Review-screen shortcuts live at the app level (UI plan, editor boundary). Capture phase,
  // so they run before the editor sees the key.
  // The keys and what they mean come from lib/shortcuts.ts, shared with the shortcuts reference.
  const handlers = useRef({ runShortcut, open })
  useLayoutEffect(() => {
    handlers.current = { runShortcut, open }
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Dialogs and menus handle their own keys (Esc closes them, typing goes into their fields).
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      const match = matchShortcut(event, 'review')
      if (!match) return
      event.preventDefault()
      event.stopPropagation()
      handlers.current.runShortcut(match.id, match.digit)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  // Single key view always shows a string from the list: the first one when none is chosen
  // or when a new filter or search leaves the current one out.
  useEffect(() => {
    if (view !== 'single' || visibleKeys.length === 0) return
    if (!activeKey || !visibleKeys.includes(activeKey)) handlers.current.open(visibleKeys[0])
  }, [view, activeKey, visibleKeys])

  useEffect(() => {
    cardRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [activeKey])

  if (strings.isPending) return <Loading />
  if (strings.isError) {
    if (strings.error instanceof ApiError && strings.error.status === 403) {
      return (
        <div className={styles.notice}>
          <p>{t('review.notAssigned')}</p>
          <Link to="/" className={ui.secondary}>
            {t('review.backToProjects')}
          </Link>
        </div>
      )
    }
    const unreachable = strings.error instanceof ApiError && strings.error.unreachable
    return <LoadError onRetry={() => void strings.refetch()} unreachable={unreachable} />
  }

  let emptyMessage: string | null = null
  if (visible.length === 0) {
    if (items.length === 0) emptyMessage = t('review.emptyNone')
    else if (filter === 'review' && !query) emptyMessage = t('review.emptyToReview')
    else if (filter === 'all' && !query) emptyMessage = t('review.emptyOpen')
    else emptyMessage = t('review.emptyFiltered')
  }

  const editorProps = (item: NonNullable<typeof active>): StringEditorProps => ({
    number: numbers.get(item.key) ?? 0,
    item,
    value,
    dirty,
    issues,
    sourceLang,
    targetLang: locale,
    error,
    editorRef,
    onChange: (next) => setDraft({ key: item.key, value: next }),
    onApproveNext: approveAndNext,
    onWithdraw: withdraw,
    onDiscard: discardOrClose,
    onInsertSuggestion: (text) => editorRef.current?.replaceAll(text),
    canReopen,
    reopening: reopen.isPending,
    onReopen: reopenActive,
    showInvisibles,
    onEdge: (direction) => move(direction === 'down' ? 1 : -1),
    onCopySource: () => runShortcut('copySource'),
    selectedSuggestion,
  })

  const reviewed = approved + delivered
  const percent = formatPercent(items.length ? reviewed / items.length : 0)
  const alsoDelivered = hiddenDelivered > 0 && (
    <p className={`${styles.alsoDelivered} ${ui.muted}`}>
      {t('review.alsoDelivered', { count: hiddenDelivered })}{' '}
      <button type="button" className={styles.linkButton} onClick={() => setFilter('delivered')}>
        {t('review.showDelivered')}
      </button>
    </p>
  )

  return (
    <ShowInvisiblesContext.Provider value={showInvisibles}>
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <input
            ref={searchRef}
            className={`${ui.input} ${styles.search}`}
            type="search"
            aria-label={t('review.searchLabel')}
            placeholder={t('review.searchPlaceholder')}
            defaultValue={query}
            onChange={(e) => {
              clearSelection()
              setSticky(new Set())
              setParam('q', e.target.value)
            }}
          />
          <div className={styles.labelled}>
            <span id="review-view-label" className={styles.groupLabel}>
              {t('review.view.visibleLabel')}
            </span>
            <div className={styles.segmented} role="group" aria-labelledby="review-view-label">
              {(['single', 'list'] as const).map((v) => (
                <button key={v} type="button" className={styles.segment} aria-pressed={view === v} onClick={() => setView(v)}>
                  {t(`review.view.${v}`)}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.tools}>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={showInvisibles}
              onClick={toggleInvisibles}
              title={t('review.invisibles')}
              aria-label={t('review.invisibles')}
            >
              <Pilcrow size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.toolButton}
              onClick={showShortcuts}
              title={t('shortcuts.open', { keys: displayKeys(shortcut('showShortcuts').keys[0]) })}
              aria-label={t('shortcuts.title')}
            >
              <Keyboard size={15} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.segmented} role="group" aria-label={t('review.filterLabel')}>
            {FILTERS.map((f) => (
              <button key={f} type="button" className={styles.segment} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`review.filter.${f}`)}
                <span className={`${styles.count} tabular`}>{counts[f]}</span>
              </button>
            ))}
          </div>
          <div className={styles.progress}>
            <ProgressBar value={reviewed} max={items.length} label={t('review.progress', { percent })} />
            <span className={`${ui.muted} tabular`}>{percent}</span>
          </div>
          <button
            type="button"
            className={ui.primary}
            onClick={() => {
              deliver.reset()
              setDelivering(true)
            }}
            disabled={approved === 0}
            title={approved === 0 ? t('review.deliver.nothing') : undefined}
          >
            <Send size={14} aria-hidden="true" />
            {approved > 0 ? t('review.deliver.count', { count: approved }) : t('review.deliver.button')}
          </button>
        </div>

        {error && !active && (
          <div className={`${ui.alert} ${styles.banner}`} role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className={`${ui.notice} ${styles.banner} ${styles.noticeBanner}`} role="status">
            <span>{notice}</span>
            <button type="button" className={ui.quiet} onClick={() => setNotice(null)}>
              {t('review.deliver.dismiss')}
            </button>
          </div>
        )}
        <DeliverDialog
          open={delivering}
          onOpenChange={setDelivering}
          language={languageLabel(locale)}
          approved={approved}
          notApproved={counts.review}
          unsavedKey={active && dirty ? active.key : null}
          pending={deliver.isPending || edit.isPending}
          error={deliver.error ? errorMessage(deliver.error, t) : null}
          onConfirm={() => void confirmDeliver()}
        />

        {view === 'single' ? (
          <div className={styles.panes}>
            {emptyMessage ? (
              <div className={styles.paneEmpty}>
                <p className={`${styles.empty} ${ui.muted}`}>{emptyMessage}</p>
                {alsoDelivered}
              </div>
            ) : (
              <KeyList items={visible} activeKey={activeKey} activeValue={value} onOpen={open} footer={alsoDelivered} />
            )}
            <section className={styles.middle} data-pane="editor" tabIndex={-1} aria-label={active ? t('review.cardLabel', { number: numbers.get(active.key) ?? 0, key: active.key }) : undefined}>
              {active ? <StringEditor {...editorProps(active)} /> : <p className={ui.muted}>{t('review.selectString')}</p>}
            </section>
            <ContextPanel item={active} />
          </div>
        ) : (
          <div className={styles.listLayout}>
            <div className={styles.listScroll} data-pane="list" tabIndex={-1}>
              <ul className={styles.list}>
                <li className={`${reviewStyles.selectable} ${styles.head}`}>
                  <span className={reviewStyles.check}>
                    <input
                      type="checkbox"
                      ref={(box) => {
                        if (box) box.indeterminate = selection.size > 0 && selection.size < selectableKeys.length
                      }}
                      checked={selectableKeys.length > 0 && selection.size === selectableKeys.length}
                      disabled={selectableKeys.length === 0}
                      onChange={toggleAll}
                      aria-label={t('review.bulk.selectAll')}
                    />
                  </span>
                  <span className={reviewStyles.headGrid} aria-hidden="true">
                    <span>{t('review.columns.number')}</span>
                    <span>{t('review.columns.key')}</span>
                    <span>
                      {t('review.columns.source')} · {sourceLang}
                    </span>
                    <span>
                      {t('review.columns.target')} · {locale}
                    </span>
                    <span style={{ textAlign: 'end' }}>{t('review.columns.chars')}</span>
                    <span>{t('review.columns.status')}</span>
                  </span>
                </li>
                {visible.map((item) => (
                  <li key={item.key}>
                    {item.key === activeKey ? (
                      <StringCard ref={cardRef} {...editorProps(item)} />
                    ) : (
                      <StringRow
                        number={numbers.get(item.key) ?? 0}
                        item={item}
                        sourceLang={sourceLang}
                        targetLang={locale}
                        onOpen={open}
                        selected={selection.has(item.key)}
                        onSelect={toggleSelected}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {emptyMessage && <p className={`${styles.empty} ${ui.muted}`}>{emptyMessage}</p>}
              {alsoDelivered}
              {selection.size > 0 && (
                <BulkBar
                  count={selection.size}
                  summary={selectionSummary}
                  pending={bulk.approve.isPending || bulk.withdraw.isPending || edit.isPending}
                  onApprove={() => void bulkApprove()}
                  onWithdraw={() => void bulkWithdraw()}
                  onClear={clearSelection}
                />
              )}
            </div>
            <ContextPanel item={active} />
          </div>
        )}

        <footer className={styles.footer}>
          <span className="tabular">
            {t('review.summary', { total: items.length, toReview: counts.review, approved, delivered })}
          </span>
          <span className={styles.hints}>
            {view === 'single' ? t('review.hintsSingle') : t('review.hints')} ·{' '}
            <button type="button" className={styles.linkButton} onClick={showShortcuts}>
              {t('shortcuts.all')} {displayKeys(shortcut('showShortcuts').keys[0])}
            </button>
          </span>
        </footer>
        {goingTo && <GoToDialog keys={items.map((item) => item.key)} onGo={goTo} onClose={() => setGoingTo(false)} />}
      </div>
    </ShowInvisiblesContext.Provider>
  )
}
