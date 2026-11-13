// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GlobalSettingText, type GlobalSettingView } from '../src/client/ClaudeCodeSettings.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let mounted: { root: Root; container: HTMLElement } | undefined

const setting: Extract<GlobalSettingView, { kind: 'text' }> = {
  key: 'worktreeBranchPrefix',
  kind: 'text',
  value: 'claude/',
  maxLength: 32,
  effect: 'next-worktree',
}

function mount(onChange = vi.fn()): { input: HTMLInputElement; onChange: ReturnType<typeof vi.fn> } {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mounted = { root, container }
  act(() => {
    root.render(<GlobalSettingText setting={setting} disabled={false} onChange={onChange} />)
  })
  const input = container.querySelector('input')
  if (input === null) throw new Error('no input')
  return { input, onChange }
}

afterEach(() => {
  if (mounted === undefined) return
  const { root, container } = mounted
  act(() => { root.unmount() })
  container.remove()
  mounted = undefined
})

describe('GlobalSettingText', () => {
  it('saves the draft when Enter blurs the field', () => {
    const { input, onChange } = mount()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      input.focus()
      setter?.call(input, 'feature/')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith('feature/')
  })

  it('restores the committed value on Escape and does not save the cancelled draft on blur', () => {
    const { input, onChange } = mount()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      input.focus()
      setter?.call(input, 'feature/')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(input.value).toBe('claude/')
    expect(onChange).not.toHaveBeenCalled()
  })
})
