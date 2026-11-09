import { render } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TargetEditor, type TargetEditorHandle } from './TargetEditor'

function setup(value: string) {
  const onChange = vi.fn()
  const ref = createRef<TargetEditorHandle>()
  const view = render(<TargetEditor ref={ref} value={value} onChange={onChange} ariaLabel="Translation" />)
  const rerender = (next: string) =>
    view.rerender(<TargetEditor ref={ref} value={next} onChange={onChange} ariaLabel="Translation" />)
  return { onChange, ref, rerender, text: () => view.getByLabelText('Translation').textContent }
}

describe('TargetEditor', () => {
  it('shows a value set from outside without reporting it as typing', () => {
    const { onChange, rerender, text } = setup('Ancien')
    rerender('Nouveau')
    expect(text()).toBe('Nouveau')
    // Reported back, a passing value would stick as an unsaved edit (Ctrl+Enter showed the old text).
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports changes made in the editor', () => {
    const { onChange, ref } = setup('Ancien')
    ref.current?.replaceAll('Nouveau')
    expect(onChange).toHaveBeenCalledWith('Nouveau')
  })
})
