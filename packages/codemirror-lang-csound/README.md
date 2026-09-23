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

### 1.0.3 (unreleased)

- Add a language-only `/compat` entry for old option names. Keep colors, panels, and evaluation in host code.
- Add generated node names and grammar-owned identifier groups under `/syntax`, with type tests and stale-artifact checks.
- Parse Csound 7 declarations, multiline UDO signatures, Unicode names, boolean rates, and array expression indexing.
- Keep Unicode and multiline UDOs available to completion, hover, and semantic highlighting.
- Let browser bundlers load the rich help catalog as a separate chunk.
- Add language-interface tests and a command to scan a Csound test checkout.

### 1.0.2

- Fix reading pfields to tokens with lower-case p. 

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
  completion: false,
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

Some ambiguous opcode/assignment lines still fall back to generic-line parsing.
Some alternate score-bin dialects remain follow-up work.

## Migrating from @hlolli/codemirror-lang-csound

New integrations should use `csound({ mode })`. A temporary, language-only
adapter keeps the old mode and completion option names:

```ts
import { csoundMode } from "@kunstmusik/codemirror-lang-csound/compat"

csoundMode({
  fileType: "csd",             // "csd" (default), "orc", or "sco"
  enableCompletion: true,
})
```

Completion defaults to true. This adapter adds no semantic colors, hover UI,
synopsis panel, legacy CSS, or indentation preference. Hosts must supply their
own presentation and evaluation behavior. The old `enableSynopsis` and
`enableDefaultTheme` options do not belong to this adapter.

The `/compat` entry also exports `csdLanguage`, `orcLanguage`, and `scoLanguage`
as aliases for the bare languages. None of these compatibility names appear in
the main entry. `csound()` keeps its existing defaults.

## Checked syntax adapters

Use semantic and hover results where possible. Hosts that need syntax-tree
access can import the current parser's checked names and groups:

```ts
import {
  csoundNodeNames as nodes,
  csoundNodeGroups,
  csoundNodeSet,
  type CsoundNodeName,
} from "@kunstmusik/codemirror-lang-csound/syntax"

const identifiers = csoundNodeSet(csoundNodeGroups.CsoundIdentifier)
const statements = csoundNodeSet([nodes.OrcStatement, nodes.ScoStatement])
identifiers.has(node.name) // Raw Lezer names remain strings.
// csoundNodeSet(["TypedIndentifier"]) // Type error.
```

The grammar marks identifier tokens with `group=CsoundIdentifier`. The build
derives frozen names, root names, and group members from `parser.nodeSet`,
including `@name` aliases. Hosts do not need to copy the identifier list.
Numeric parser IDs and anonymous/error nodes are not part of this entry.

Highlight, fold, and indent maps in the package check their keys against
`CsoundNodeName`. Semantic and hover code use the same generated names.
This catches misspellings and removed names, not changes in tree structure or
host evaluation policy; keep integration tests for those.

After editing the grammar, run `npm run build:grammar` and commit the generated
parser and `src/syntax-nodes.ts`. `npm test` checks that these files match the
grammar **before** rebuilding, then runs declaration-level tests that must
reject invalid names. CI runs the same checks.

## Csound corpus tests

```sh
npm run test:csound -- /path/to/csound/tests
```

The scanner also reads `CSOUND_TESTS_DIR`. It checks `.csd`, `.orc`, `.sco`,
and `.udo` files and exits with an error on unexpected parser recovery.
It allows named or explicitly marked error fixtures. This checks editor parsing,
not whether Csound can compile or run a file.
