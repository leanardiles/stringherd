// The only file in the app that knows about CodeMirror (UI plan, editor boundary).
// The rest of the app sees: value in, onChange out, and the commands in TargetEditorHandle.
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
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
import { placeholderPattern } from '../../lib/placeholders'
import styles from './TargetEditor.module.css'

export interface TargetEditorHandle {
  focus(): void
  /** Replace the whole text, as inserting a suggestion does in CAT tools. */
  replaceAll(text: string): void
}

interface Props {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  lang?: string
  autoFocus?: boolean
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

export const TargetEditor = forwardRef<TargetEditorHandle, Props>(function TargetEditor(
  { value, onChange, ariaLabel, lang, autoFocus },
  ref,
) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
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
  }))

  return <div ref={host} className={styles.editor} />
})
