import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { dracula } from '@uiw/codemirror-theme-dracula'
import { githubDark } from '@uiw/codemirror-theme-github'
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { csound } from '@kunstmusik/codemirror-lang-csound'
import type { EditorTheme, Mode } from './App'

interface EditorProps {
  value: string
  onChange: (value: string) => void
  mode: Mode
  theme: EditorTheme
}

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '0.92rem',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", monospace',
    },
    '.cm-content': {
      padding: '1rem 0',
    },
    '.cm-line': { padding: '0 1.15rem' },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      outline: '1px solid currentColor',
    },
    '.cm-panels': {
      borderRadius: '0 0 1rem 1rem',
    },
    '.cm-searchMatch': {
      outline: '1px solid currentColor',
    },
  },
  { dark: true },
)

const themeExtensions: Record<EditorTheme, Extension> = {
  vscodeDark,
  githubDark,
  dracula,
  tokyoNight,
}

export default function Editor({ value, onChange, mode, theme }: EditorProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    valueRef.current = value
    const view = viewRef.current
    if (!view) return

    const currentValue = view.state.doc.toString()
    if (currentValue === value) return

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  useEffect(() => {
    if (!parentRef.current) return

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        basicSetup,
        csound({ mode }),
        themeExtensions[theme],
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        editorTheme,
      ]
    })

    const view = new EditorView({
      state,
      parent: parentRef.current
    })

    viewRef.current = view

    return () => {
      view.destroy()
      if (viewRef.current === view) {
        viewRef.current = null
      }
    }
  }, [mode, theme])

  return <div ref={parentRef} className="editor-shell h-full" />
}
