import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(__dirname, "../src/opcodes.json")
const richOutputPath = resolve(__dirname, "../src/opcodes-rich.json")

const result = spawnSync("csound", ["-z1"], {
  encoding: "utf8",
})

const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
const marker = combinedOutput.match(/\n\s*(\d+)\s+opcodes\b/)

if (!marker) {
  throw new Error("Could not find opcode count marker in `csound -z1` output.")
}

const opcodeBlock = combinedOutput.slice(0, marker.index)
const signaturesByOpcode = new Map()

for (const line of opcodeBlock.split(/\r?\n/)) {
  const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s*$/)
  if (!match) continue

  const [, name, outTypes, inTypes] = match
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue

  const signatures = signaturesByOpcode.get(name) ?? []
  signatures.push({ outTypes, inTypes })
  signaturesByOpcode.set(name, signatures)
}

const opcodes = Array.from(signaturesByOpcode, ([name, signatures]) => ({
  name,
  signatures,
})).sort((a, b) => a.name.localeCompare(b.name))

if (opcodes.length === 0) {
  throw new Error("No opcode signatures were parsed from `csound -z1` output.")
}

const signatureCount = opcodes.reduce((count, opcode) => count + opcode.signatures.length, 0)

mkdirSync(dirname(outputPath), { recursive: true })
mkdirSync(dirname(richOutputPath), { recursive: true })

const catalog = {
  source: "csound -z1",
  generatedBy: "scripts/generate-opcode-catalog.mjs",
  count: opcodes.length,
  signatureCount,
  opcodes,
}

writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`)
writeFileSync(richOutputPath, `${JSON.stringify(catalog, null, 2)}\n`)

console.log(
  `Wrote ${opcodes.length} opcodes and ${signatureCount} signatures to ${outputPath} and ${richOutputPath}`,
)
