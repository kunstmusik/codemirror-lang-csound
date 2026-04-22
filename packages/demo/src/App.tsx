import { useDeferredValue, useEffect, useRef, useState } from 'react'
import Editor from './Editor'
import livecodeOrc from '../../codemirror-lang-csound/test/fixtures/livecode.orc?raw'
import trappedCsd from './assets/trapped.csd?raw'

export type Mode = 'csd' | 'orc' | 'sco'
export type EditorTheme = 'vscodeDark' | 'githubDark' | 'dracula' | 'tokyoNight'

const modes: Array<{
  id: Mode
  label: string
  eyebrow: string
  sampleFile: string
  description: string
}> = [
  {
    id: 'csd',
    label: 'CSD',
    eyebrow: 'full document',
    sampleFile: 'trapped.csd',
    description: 'Parse CsoundSynthesizer files with embedded orchestra and score sections.',
  },
  {
    id: 'orc',
    label: 'ORC',
    eyebrow: 'orchestra',
    sampleFile: 'livecode.orc',
    description: 'Focus on instruments, UDOs, control flow, and opcode-heavy orchestra code.',
  },
  {
    id: 'sco',
    label: 'SCO',
    eyebrow: 'score',
    sampleFile: 'score.sco',
    description: 'Inspect score statements, p-fields, comments, macros, and section markers.',
  },
]

const scoreSample = [
  '; score grammar sample',
  'f1 0 8192 10 1',
  "i1 0 .5 + np^3 pp^4 $MACRO(1'2)",
  't 0 60 40 120',
  's',
  'e',
  '',
].join('\n')

const modeSamples: Record<Mode, string> = {
  csd: trappedCsd,
  orc: livecodeOrc,
  sco: scoreSample,
}

const editorThemes: Array<{
  id: EditorTheme
  label: string
  description: string
}> = [
  { id: 'vscodeDark', label: 'VS Code Dark', description: 'Familiar IDE contrast.' },
  { id: 'githubDark', label: 'GitHub Dark', description: 'Muted review palette.' },
  { id: 'dracula', label: 'Dracula', description: 'High-chroma night mode.' },
  { id: 'tokyoNight', label: 'Tokyo Night', description: 'Cool blue stage light.' },
]

export default function App() {
  const [mode, setMode] = useState<Mode>('csd')
  const [editorTheme, setEditorTheme] = useState<EditorTheme>('vscodeDark')
  const [code, setCode] = useState(modeSamples.csd)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedMode = modes.find(item => item.id === mode) ?? modes[0]
  const selectedTheme = editorThemes.find(item => item.id === editorTheme) ?? editorThemes[0]

  function selectMode(nextMode: Mode) {
    setMode(nextMode)
    setCode(modeSamples[nextMode])
    setDropdownOpen(false)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <main className="relative flex h-screen flex-col overflow-hidden text-ink">
      <div className="grain-overlay pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute -left-24 top-16 h-80 w-80 rounded-full border border-patine/20" />
      <div className="pointer-events-none absolute -right-32 bottom-10 h-96 w-96 rounded-full bg-patine/10 blur-3xl" />

      <header className="relative z-20 flex flex-shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-paper/80 px-6 py-3 backdrop-blur">
        <h1 className="font-display text-2xl tracking-[-0.04em] text-ink">
          Csound Codemirror Lab
        </h1>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-left transition hover:border-patine/40 hover:bg-white/10"
          >
            <span className="flex items-baseline gap-2">
              <span className="font-display text-xl tracking-[-0.04em]">.{selectedMode.id}</span>
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/55">
                {selectedMode.eyebrow}
              </span>
            </span>
            <svg
              className={`h-4 w-4 text-ink/50 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 z-20 mt-2 w-80 rounded-2xl border border-white/10 bg-paper p-2 shadow-[0_20px_60px_rgb(0_0_0_/_0.5)]">
              {modes.map(item => {
                const selected = item.id === mode
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectMode(item.id)}
                    className={[
                      'mb-1 w-full rounded-xl border p-4 text-left transition duration-200 last:mb-0',
                      selected
                        ? 'border-patine/60 bg-[#37373d] text-ink'
                        : 'border-transparent text-ink/85 hover:bg-white/10 hover:text-ink',
                    ].join(' ')}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-2xl tracking-[-0.04em]">
                        .{item.id}
                      </span>
                      <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] opacity-55">
                        {item.eyebrow}
                      </span>
                    </span>
                    <span className="mt-1.5 block text-sm leading-5 opacity-75">
                      {item.description}
                    </span>
                    <span className="mt-1 block font-mono text-[0.6rem] uppercase tracking-[0.18em] text-copper/70">
                      {item.sampleFile}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </header>

      <section className="relative z-10 min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#1e1e1e] px-4 py-2 text-ink">
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.24em] text-brass">
              {selectedMode.sampleFile}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-ink/75">
                <span>theme</span>
                <select
                  value={editorTheme}
                  onChange={event => setEditorTheme(event.target.value as EditorTheme)}
                  className="bg-transparent font-mono text-xs normal-case tracking-normal text-ink outline-none"
                  aria-label="Editor theme"
                >
                  {editorThemes.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="hidden rounded-full border border-brass/25 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-brass/80 sm:inline-flex">
                {selectedTheme.description}
              </span>
              <button
                type="button"
                onClick={() => setCode(modeSamples[mode])}
                className="rounded-full border border-white/15 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-ink/75 transition hover:border-patine/70 hover:text-patine"
              >
                reset
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <Editor value={code} onChange={setCode} mode={mode} theme={editorTheme} />
          </div>
        </div>
      </section>
    </main>
  )
}
