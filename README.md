# codemirror-lang-csound

[![npm version](https://img.shields.io/npm/v/%40kunstmusik%2Fcodemirror-lang-csound)](https://www.npmjs.com/package/@kunstmusik/codemirror-lang-csound)

Monorepo for `@kunstmusik/codemirror-lang-csound`, a CodeMirror 6 language package for Csound.

## Packages

- `packages/codemirror-lang-csound`: publishable language package for CSD, ORC, and SCO editing.
- `packages/demo`: local Vite + React demo app for exercising the package during development.

## Version 1.0.3

Version 1.0.3 adds Csound 7 syntax support, a language-only compatibility entry,
and generated syntax names for host integrations. See the
[package changelog](packages/codemirror-lang-csound/README.md#changelog) for details.

The remaining parser work includes full opcode/assignment disambiguation,
whitespace-sensitive unbracketed score expressions, richer alternate score-bin
parsing, and richer auxiliary XML/UI parsing.

## Workspace Commands

```sh
npm install
npm run build
npm test
npm run dev --workspace packages/demo
npm run test:csound --workspace packages/codemirror-lang-csound -- /path/to/csound/tests
```

## Publishing the Language Package

From the repository root, verify the release and inspect the package archive:

```sh
npm ci
npm test
npm run build
npm pack --workspace packages/codemirror-lang-csound --dry-run
```

The `prepack` script checks generated parser files and builds `dist` before
packing. Only `packages/codemirror-lang-csound` is published; the demo is private.
After verifying the archive, publish with:

```sh
npm publish --workspace packages/codemirror-lang-csound --access public
```

Release 1.0.3 before updating the Web IDE dependency and lockfile. Blue's
exact 1.0.2 dependency remains unchanged until Blue opts into the new version.
The opcode catalog generator expects a sibling `../manual` checkout when
running the manual-based catalog script.

## Structure

```text
.
├── package.json
├── package-lock.json
└── packages/
    ├── codemirror-lang-csound/
    └── demo/
```
