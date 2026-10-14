// The only file in the app that knows about CodeMirror (UI plan, editor boundary).
// The rest of the app sees: value in, onChange out, and the commands in TargetEditorHandle.
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { INVISIBLES, invisibleKind, placeholderPattern } from '../../lib/placeholders'
import styles from './TargetEditor.module.css'

export interface TargetEditorHandle {
  focus(): void
  /** Replace the whole text, as inserting a suggestion does in CAT tools. */
  replaceAll(text: string): void
  /** Insert at the cursor, replacing any selected text (placeholders, non-breaking space). */
  insertText(text: string): void
}

interface Props {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  lang?: string
  autoFocus?: boolean
  /** Show spaces, non-breaking spaces and tabs as marks. */
  showInvisibles?: boolean
  /** ↑ on the first line or ↓ on the last: return true when the page moved to another string. */
  onEdge?: (direction: 'up' | 'down') => boolean
}

/** Placeholders such as {{count}} render as one locked chip: the cursor skips it, Backspace removes it whole. */
class ChipWidget extends WidgetType {
  readonly text: string
  constructor(text: string) {
    super()
    this.text = text
  }
  eq(other: ChipWidget) {
    return other.text === this.text
  }
  toDOM() {
    const chip = document.createElement('span')
    chip.className = styles.chip
    chip.textContent = this.text
    return chip
  }
}

const chipMatcher = new MatchDecorator({
  regexp: placeholderPattern(),
  decoration: (match) => Decoration.replace({ widget: new ChipWidget(match[0]) }),
})

const chips = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = chipMatcher.createDeco(view)
    }
    update(update: ViewUpdate) {
      this.decorations = chipMatcher.updateDeco(update, this.decorations)
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
)

/** Each space-like character gets a class; the CSS draws its mark (· ° →) over it. */
const invisibleMatcher = new MatchDecorator({
  regexp: INVISIBLES,
  decoration: (match) => Decoration.mark({ class: styles[invisibleKind(match[0])] }),
})

const invisibles = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = invisibleMatcher.createDeco(view)
    }
    update(update: ViewUpdate) {
      this.decorations = invisibleMatcher.updateDeco(update, this.decorations)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

/** True when the cursor cannot move one visual line further in that direction. */
function atEdge(view: EditorView, forward: boolean): boolean {
  const range = view.state.selection.main
  if (!range.empty) return false
  const moved = view.moveVertically(range, forward)
  if (moved.head === range.head) return true
  const here = view.coordsAtPos(range.head)
  const there = view.coordsAtPos(moved.head)
  if (!here || !there) return true
  return forward ? there.top <= here.top : there.top >= here.top
}

export const TargetEditor = forwardRef<TargetEditorHandle, Props>(function TargetEditor(
  { value, onChange, ariaLabel, lang, autoFocus, showInvisibles = false, onEdge },
  ref,
) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const invisiblesSlot = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  const onEdgeRef = useRef(onEdge)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
    onEdgeRef.current = onEdge
  })

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          // Arrow keys at the first or last line move to another string (Phrase does the same).
          Prec.high(
            keymap.of([
              { key: 'ArrowUp', run: (v) => atEdge(v, false) && (onEdgeRef.current?.('up') ?? false) },
              { key: 'ArrowDown', run: (v) => atEdge(v, true) && (onEdgeRef.current?.('down') ?? false) },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          invisiblesSlot.current.of(showInvisibles ? invisibles : []),
          EditorView.lineWrapping,
          chips,
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel, lang: lang ?? '', spellcheck: 'true' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    if (autoFocus) {
      editor.focus()
      editor.dispatch({ selection: { anchor: editor.state.doc.length } })
    }
    return () => {
      editor.destroy()
      view.current = null
    }
    // Created once per mount; later value changes are synced below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: invisiblesSlot.current.reconfigure(showInvisibles ? invisibles : []) })
  }, [showInvisibles])

  // Outside changes (discard, server response) replace the text.
  useEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
    }
  }, [value])

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    replaceAll: (text: string) => {
      const editor = view.current
      if (!editor) return
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: text },
        selection: { anchor: text.length },
        userEvent: 'input.replace',
      })
      editor.focus()
    },
    insertText: (text: string) => {
      const editor = view.current
      if (!editor) return
      editor.dispatch(editor.state.replaceSelection(text), { userEvent: 'input', scrollIntoView: true })
      editor.focus()
    },
  }))

  return <div ref={host} className={styles.editor} />
})
