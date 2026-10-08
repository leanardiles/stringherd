import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError, type ReviewEdit } from '../api/client'
import { useEditString, useReviewProjects, useReviewStrings } from '../api/queries'
import type { TargetEditorHandle } from '../components/editor/TargetEditor'
import { ProgressBar } from '../components/ProgressBar'
import { ContextPanel } from '../components/review/ContextPanel'
import { KeyList } from '../components/review/KeyList'
import reviewStyles from '../components/review/Review.module.css'
import { StringCard } from '../components/review/StringCard'
import { StringEditor, type StringEditorProps } from '../components/review/StringEditor'
import { StringRow } from '../components/review/StringRow'
import { LoadError, Loading } from '../components/StatusMessage'
import ui from '../components/ui.module.css'
import { formatPercent } from '../lib/languages'
import { checkTranslation, qaLevel } from '../lib/qa'
import { matchesFilter, neighbourKey, type StatusFilter } from '../lib/review'
import styles from './ReviewPage.module.css'

const FILTERS: StatusFilter[] = ['all', 'review', 'approved']
type View = 'single' | 'list'
const VIEW_STORAGE_KEY = 'stringherd.reviewView'

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
  const active = activeKey ? items.find((item) => item.key === activeKey) ?? null : null
  const value = active ? (draft?.key === active.key ? draft.value : active.value) : ''
  const dirty = active !== null && value !== active.value
  const issues = useMemo(() => (active ? checkTranslation(active.source_text, value) : []), [active, value])

  const approved = items.filter((item) => item.status === 'approved').length
  const counts: Record<StatusFilter, number> = { all: items.length, review: items.length - approved, approved }

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
    setError(null)
    setParam('key', key)
  }

  function approveAndNext() {
    if (!active) return
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

  function move(step: 1 | -1) {
    const next = neighbourKey(visibleKeys, activeKey, step)
    if (next) open(next)
  }

  function insertSuggestion(index: number) {
    if (index === 1 && active?.machine_translation != null) editorRef.current?.replaceAll(active.machine_translation)
  }

  function setFilter(next: StatusFilter) {
    setSticky(new Set())
    setParam('status', next === 'all' ? null : next)
  }

  function setView(next: View) {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // private window: the choice lasts for this page only
    }
    setParam('view', next)
  }

  // Review-screen shortcuts live at the app level (UI plan, editor boundary). Capture phase,
  // so they run before the editor sees the key.
  const handlers = useRef({ approveAndNext, withdraw, discardOrClose, move, insertSuggestion, open })
  useLayoutEffect(() => {
    handlers.current = { approveAndNext, withdraw, discardOrClose, move, insertSuggestion, open }
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey
      const h = handlers.current
      let handled = true
      if (mod && event.key === 'Enter' && !event.shiftKey) h.approveAndNext()
      else if (mod && event.key === 'Enter' && event.shiftKey) h.withdraw()
      else if (event.altKey && event.key === 'ArrowDown') h.move(1)
      else if (event.altKey && event.key === 'ArrowUp') h.move(-1)
      else if (mod && !event.shiftKey && /^[1-9]$/.test(event.key)) h.insertSuggestion(Number(event.key))
      else if (event.key === 'Escape' && !document.querySelector('[role="menu"]')) h.discardOrClose()
      else handled = false
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
      }
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
  })

  const percent = formatPercent(items.length ? approved / items.length : 0)

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <input
          className={`${ui.input} ${styles.search}`}
          type="search"
          aria-label={t('review.searchLabel')}
          placeholder={t('review.searchPlaceholder')}
          defaultValue={query}
          onChange={(e) => {
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
        <div className={styles.segmented} role="group" aria-label={t('review.filterLabel')}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className={styles.segment} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t(`review.filter.${f}`)}
              <span className={`${styles.count} tabular`}>{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className={styles.progress}>
          <ProgressBar value={approved} max={items.length} label={t('projects.progress', { percent })} />
          <span className={`${ui.muted} tabular`}>{percent}</span>
        </div>
      </div>

      {error && !active && (
        <div className={`${ui.alert} ${styles.banner}`} role="alert">
          {error}
        </div>
      )}

      {view === 'single' ? (
        <div className={styles.panes}>
          {emptyMessage ? (
            <p className={`${styles.empty} ${ui.muted} ${styles.paneEmpty}`}>{emptyMessage}</p>
          ) : (
            <KeyList items={visible} activeKey={activeKey} activeValue={value} onOpen={open} />
          )}
          <section className={styles.middle} aria-label={active ? t('review.cardLabel', { number: numbers.get(active.key) ?? 0, key: active.key }) : undefined}>
            {active ? <StringEditor {...editorProps(active)} /> : <p className={ui.muted}>{t('review.selectString')}</p>}
          </section>
          <ContextPanel item={active} />
        </div>
      ) : (
        <div className={styles.listLayout}>
          <div className={styles.listScroll}>
            <ul className={styles.list}>
              <li className={`${reviewStyles.grid} ${styles.head}`} aria-hidden="true">
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
                    />
                  )}
                </li>
              ))}
            </ul>
            {emptyMessage && <p className={`${styles.empty} ${ui.muted}`}>{emptyMessage}</p>}
          </div>
          <ContextPanel item={active} />
        </div>
      )}

      <footer className={styles.footer}>
        <span className="tabular">{t('review.summary', { total: items.length, toReview: counts.review, approved })}</span>
        <span className={styles.hints}>{view === 'single' ? t('review.hintsSingle') : t('review.hints')}</span>
      </footer>
    </div>
  )
}
