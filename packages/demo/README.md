# demo

Local Vite + React demo app for `@kunstmusik/codemirror-lang-csound`.

## Purpose

The demo is for local package development and manual editor verification. It exercises:

- CSD, ORC, and SCO modes
- Theme switching
- The local workspace build of `@kunstmusik/codemirror-lang-csound`

## Commands

```sh
npm run dev --workspace packages/demo
npm run build --workspace packages/demo
```

Run the root workspace build first if you need fresh `dist/` output from the language package.