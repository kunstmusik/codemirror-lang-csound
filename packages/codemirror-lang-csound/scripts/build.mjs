import { build } from "esbuild"
import { rm } from "node:fs/promises"

// Do not publish outputs left behind after moving or removing an entry point.
await rm(new URL("../dist/", import.meta.url), { recursive: true, force: true })

const shared = {
  entryPoints: ["src/index.ts", "src/compat.ts", "src/syntax.ts", "src/opcodes-rich.ts"],
  bundle: true,
  packages: "external",
  // Keep help data separate while letting consumer bundlers follow the import.
  external: ["./opcodes-rich.js"],
  platform: "neutral",
  sourcemap: true,
  logLevel: "info",
  outdir: "dist",
}

await Promise.all([
  build({
    ...shared,
    format: "esm",
    external: [...shared.external, "./index.js"],
  }),
  build({
    ...shared,
    format: "cjs",
    outExtension: { ".js": ".cjs" },
    plugins: [{
      name: "compat-core-entry",
      setup(build) {
        build.onResolve({ filter: /^\.\/index\.js$/ }, () => ({ path: "./index.cjs", external: true }))
      },
    }],
  }),
])
