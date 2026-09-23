import assert from "node:assert/strict"
import test from "node:test"
import { parser } from "../src/parser.js"
import { EditorState } from "@codemirror/state"
import { CompletionContext } from "@codemirror/autocomplete"
import { analyzeCsoundSemanticLine, csoundCompletionSource, getCsoundHoverInfo } from "../dist/index.js"

function parse(source) {
  const tree = parser.configure({ top: "OrchestraFile" }).parse(source)
  const nodes = []
  tree.iterate({ enter(node) {
    assert.equal(node.type.isError, false, "Unexpected recovery at " + source.slice(node.from, node.to + 20))
    nodes.push({ name: node.name, text: source.slice(node.from, node.to) })
  } })
  return nodes
}

test("declare and multiline UDO signatures have structured nodes", () => {
  const nodes = parse([
    "declare split(",
    "  signal:a",
    "):(",
    "  a,",
    "  a",
    ")",
    "opcode split(",
    "  signal:a",
    "):(",
    "  a,",
    "  a",
    ")",
    "  xout(signal, signal)",
    "endop",
    "",
  ].join("\n"))
  assert.equal(nodes.filter(node => node.name === "DeclareDefinition").length, 1)
  assert.equal(nodes.filter(node => node.name === "ModernUdo").length, 1)
})

test("array literals, parenthesized expressions and multidimensional types stay structured", () => {
  const nodes = parse([
    "first:i = [1, 2, 3][0]",
    "slice:i[] = ([1, 2, 3])[:2]",
    "matrix:k[][] init 2, 3",
    "shared@global:k[][] init 2, 3",
    "",
  ].join("\n"))
  assert.equal(nodes.filter(node => node.name === "ArrayAccessExpr").length, 2)
  assert.ok(nodes.some(node => node.name === "TypedArrayIdentifier" && node.text === "matrix:k[][]"))
  assert.ok(nodes.some(node => node.name === "GlobalTypedArrayIdentifier" && node.text === "shared@global:k[][]"))
})

test("Unicode names, boolean rates and boolean literals remain whole tokens", () => {
  const nodes = parse([
    "struct Punktur hæð:i, breidd:i",
    "staða@global:Punktur init 0, 0",
    "opcode tvöfalda(gildi:i):i",
    "  xout(gildi * 2)",
    "endop",
    "bFlag = true",
    "BFlag = truek",
    "gbFlag = false",
    "gBFlag = falsek",
    "if ¬bFlag then",
    "  svar:i = tvöfalda(21)",
    "endif",
    "",
  ].join("\n"))
  assert.deepEqual(nodes.filter(node => node.name === "BooleanLiteral").map(node => node.text), ["true", "truek", "false", "falsek"])
  assert.ok(nodes.some(node => node.name === "TypedIdentifier" && node.text === "hæð:i"))
  assert.ok(nodes.some(node => node.name === "Identifier" && node.text === "tvöfalda"))
  for (const name of ["bFlag", "BFlag", "gbFlag", "gBFlag"]) {
    assert.ok(nodes.some(node => node.name === "LegacyTypeIdentifier" && node.text === name))
  }
})

test("completion and hover retain Unicode, declarations and multiline return types", async () => {
  const documentText = [
    "declare tvöfalda(gildi:i):(",
    "  i,",
    "  i",
    ")",
    "opcode tvöfalda(",
    "  gildi:i",
    "):(",
    "  i,",
    "  i",
    ")",
    "  xout(gildi, gildi)",
    "endop",
    "tvö",
  ].join("\n")
  const state = EditorState.create({ doc: documentText })
  const result = csoundCompletionSource(new CompletionContext(state, state.doc.length, true))
  assert.ok(result.options.some(option => option.label === "tvöfalda" && option.detail === "UDO"))
  assert.equal(documentText.slice(result.from), "tvö")
  const info = await getCsoundHoverInfo("tvöfalda", { documentText })
  assert.deepEqual(info.signatures, [{ outTypes: "ii", inTypes: "i" }])
})

test("semantic analysis keeps Unicode inputs, outputs and UDO names whole", () => {
  const line = "rödd:a = tvöfalda(inntak)"
  const spans = analyzeCsoundSemanticLine(line, {
    documentText: "opcode tvöfalda(signal:a):a\nendop\n" + line,
  })
  assert.deepEqual(spans.map(span => ({ text: line.slice(span.from, span.to), kind: span.kind })), [
    { text: "rödd:a", kind: "output" },
    { text: "tvöfalda", kind: "userOpcode" },
    { text: "inntak", kind: "input" },
  ])
  assert.deepEqual(analyzeCsoundSemanticLine("enabled:B = truek").map(span => span.kind), ["output"])
})
