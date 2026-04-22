# codemirror-lang-csound

Monorepo for `@kunstmusik/codemirror-lang-csound`, a CodeMirror 6 language package for Csound.

## Packages

- `packages/codemirror-lang-csound`: publishable language package for CSD, ORC, and SCO editing.
- `packages/demo`: local Vite + React demo app for exercising the package during development.

## V1 Status

This is a good v1 release point.

- The language package test suite currently passes 81 tests.
- The latest external `csound/tests` scan covers 1190 `.csd` / `.orc` / `.sco` files and leaves 33 recovery cases.
- Those remaining cases are all intentional parse-error fixtures or malformed inputs such as `regression/gen16.csd`.

The remaining parser work is post-v1 material: full opcode/assignment disambiguation, whitespace-sensitive unbracketed score expressions, richer alternate score-bin parsing, and richer auxiliary XML/UI parsing.

## Workspace Commands

```sh
npm install
npm run build
npm test
npm run dev --workspace packages/demo
```

## Release Notes

- The npm package name is `@kunstmusik/codemirror-lang-csound`.
- The opcode catalog generator expects a sibling `../manual` checkout when running the manual-based catalog script.

## Structure

```text
.
├── package.json
├── packages/
│   ├── codemirror-lang-csound/
│   └── demo/
├── PLAN.md
└── STATUS.md
```