# @kunstmusik/codemirror-lang-csound

CodeMirror 6 language support for Csound, covering CSD, ORC, and SCO files.

## Features

- One Lezer-based language package with modes for full `.csd`, orchestra `.orc`, and score `.sco` documents.
- Syntax highlighting, indentation, folding, and comment support for Csound editing.
- Opcode autocomplete backed by generated Csound opcode metadata.
- Semantic highlighting for built-in opcodes, UDOs, p-fields, named instruments, and score fragments.
- Hover info for built-in opcodes and document-local UDOs.

## Install

```sh
npm install @kunstmusik/codemirror-lang-csound
```

## Changelog

### 1.0.1

- Fixed the package `exports` condition ordering so newer Vite and Rolldown-based builds do not fail on the published package metadata.
- No runtime API changes. This is a packaging and compatibility release on top of 1.0.0.

### 1.0.0

- Initial public release of the Csound CodeMirror 6 language package.
- Shipped CSD, ORC, and SCO modes with autocomplete, semantic highlighting, hover info, and the rich opcode metadata entrypoint.

## Quick Start

```ts
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { basicSetup } from "codemirror"
import { csound } from "@kunstmusik/codemirror-lang-csound"

const doc = `<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
instr 1
  a1 oscil 0.2, 440
  out a1
endin
</CsInstruments>
<CsScore>
i1 0 1
e
</CsScore>
</CsoundSynthesizer>`

const state = EditorState.create({
  doc,
  extensions: [
    basicSetup,
    csound({ mode: "csd" }),
  ],
})

new EditorView({
  state,
  parent: document.querySelector("#editor")!,
})
```

`csound()` defaults to `mode: "csd"`. It also enables semantic highlighting and hover support by default.

## Modes

```ts
import { csound } from "@kunstmusik/codemirror-lang-csound"

csound({ mode: "csd" })
csound({ mode: "orc" })
csound({ mode: "sco" })
```

If you need the bare languages instead of the bundled `LanguageSupport`, the package also exports `csoundCsdLanguage`, `csoundOrcLanguage`, and `csoundScoLanguage`.

## Optional Configuration

```ts
csound({
  mode: "orc",
  semanticHighlighting: false,
  hover: false,
})
```

## Rich Metadata Entry Point

The package exposes a separate rich metadata bundle at `@kunstmusik/codemirror-lang-csound/rich` for consumers that want direct access to the manual-derived opcode catalog.

```ts
import { csoundRichOpcodeCatalog } from "@kunstmusik/codemirror-lang-csound/rich"
```

Hover support lazy-loads that richer catalog automatically when it needs manual metadata.

## V1 Scope

The 1.0.x baseline is aimed at editor support first. Some ambiguous opcode/assignment lines still fall back to generic-line parsing, and some alternate score-bin dialects are intentionally left as post-v1 follow-up work.