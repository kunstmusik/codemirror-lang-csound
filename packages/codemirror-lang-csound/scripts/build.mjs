import { build } from "esbuild"

const shared = {
  entryPoints: ["src/index.ts", "src/opcodes-rich.ts"],
  bundle: true,
  packages: "external",
  platform: "neutral",
  sourcemap: true,
  logLevel: "info",
  outdir: "dist",
}

await Promise.all([
  build({
    ...shared,
    format: "esm",
  }),
  build({
    ...shared,
    format: "cjs",
    outExtension: { ".js": ".cjs" },
  }),
])
