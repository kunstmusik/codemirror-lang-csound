import { readFile, writeFile } from "node:fs/promises"
import { NodeProp } from "@lezer/common"
import { buildParserFile } from "@lezer/generator"
import { parser } from "../src/parser.js"

const source = new URL("../src/", import.meta.url)
const check = process.argv.includes("--check")
const named = parser.nodeSet.types.filter(type => type.name && !type.isError)
const names = [...new Set(named.map(type => type.name))].sort()
const groups = new Map()
for (const type of named) {
  for (const group of type.prop(NodeProp.group) ?? []) {
    if (!groups.has(group)) groups.set(group, new Set())
    groups.get(group).add(type.name)
  }
}
const quote = JSON.stringify
const output = [
  "// Generated from parser.nodeSet by scripts/generate-syntax-nodes.mjs. Do not edit.",
  "// Numeric term IDs and anonymous/error nodes are deliberately not part of this interface.",
  "export const csoundNodeNames = Object.freeze({",
  ...names.map(name => "  " + quote(name) + ": " + quote(name) + ","),
  "} as const)",
  "",
  "export type CsoundNodeName = keyof typeof csoundNodeNames",
  "",
  "export const csoundNodeGroups = Object.freeze({",
  ...[...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).flatMap(([group, members]) => [
    "  " + quote(group) + ": Object.freeze([",
    ...[...members].sort().map(name => "    " + quote(name) + ","),
    "  ] as const),",
  ]),
  "} as const)",
  "",
  "export const csoundTopNodeNames = Object.freeze(" +
    JSON.stringify(named.filter(type => type.isTop).map(type => type.name).sort()) + " as const)",
  "export type CsoundTopNodeName = typeof csoundTopNodeNames[number]",
  "",
].join("\n")

if (check) {
  // Check before rebuilding, so a test run cannot silently repair stale committed artifacts.
  const grammar = await readFile(new URL("csound.grammar", source), "utf8")
  const generated = buildParserFile(grammar)
  const expected = { "parser.js": generated.parser, "parser.terms.js": generated.terms, "syntax-nodes.ts": output }
  for (const [file, contents] of Object.entries(expected)) {
    const actual = await readFile(new URL(file, source), "utf8").catch(() => null)
    if (actual !== contents) {
      console.error(file + " is stale. Run npm run build:grammar and commit the generated files.")
      process.exitCode = 1
    }
  }
} else {
  await writeFile(new URL("syntax-nodes.ts", source), output)
}
