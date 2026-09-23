import assert from "node:assert/strict"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

test("browser bundlers can discover and split the lazy help catalog", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "browser",
    splitting: true,
    outdir: "out",
    write: false,
    metafile: true,
    logLevel: "silent",
  })
  assert.ok(Object.keys(result.metafile.inputs).some(path => path.endsWith("dist/opcodes-rich.js")))
  assert.ok(!Object.keys(result.metafile.inputs).some(path => path.endsWith("dist/compat.js")))
  const main = Object.values(result.metafile.outputs).find(output => output.entryPoint?.endsWith("dist/index.js"))
  assert.ok(main.imports.some(entry => entry.kind === "dynamic-import"))
  assert.ok(!Object.keys(main.inputs).some(path => path.endsWith("dist/opcodes-rich.js")))
})
