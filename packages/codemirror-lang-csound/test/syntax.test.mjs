import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
import { NodeProp } from "@lezer/common"
import { parser } from "../src/parser.js"
import * as syntax from "@kunstmusik/codemirror-lang-csound/syntax"

test("generated names match visible syntax-tree names, not generator term symbols", () => {
  const names = [...new Set(parser.nodeSet.types.filter(type => type.name && !type.isError).map(type => type.name))].sort()
  assert.deepEqual(Object.keys(syntax.csoundNodeNames), names)
  assert.deepEqual(Object.values(syntax.csoundNodeNames), names)
  assert.equal(syntax.csoundNodeNames.Identifier, "Identifier")
  assert.equal(syntax.csoundNodeNames.if, "if")
  assert.equal("_if" in syntax.csoundNodeNames, false)
  assert.deepEqual(syntax.csoundTopNodeNames, parser.nodeSet.types.filter(type => type.isTop).map(type => type.name).sort())
})

test("identifier groups come from the grammar and exclude specialized keywords", () => {
  for (const [group, names] of Object.entries(syntax.csoundNodeGroups)) {
    const expected = parser.nodeSet.types.filter(type => type.prop(NodeProp.group)?.includes(group)).map(type => type.name).sort()
    assert.deepEqual(names, expected)
    const members = syntax.csoundNodeSet(names)
    for (const type of parser.nodeSet.types) assert.equal(members.has(type.name), type.is(group), type.name)
  }
  const identifiers = syntax.csoundNodeSet(syntax.csoundNodeGroups.CsoundIdentifier)
  for (const name of ["instr", "if", "true", "declare", "UnknownNode"]) assert.equal(identifiers.has(name), false)
  const tree = parser.configure({ top: "OrchestraFile" }).parse("0dbfs = 1\nsignal@global:a = input:a\n")
  const names = []
  tree.iterate({ enter(node) { if (identifiers.has(node.name)) names.push(node.name) } })
  assert.deepEqual(names, ["HeaderIdentifier", "GlobalTypedIdentifier", "TypedIdentifier"])
})

test("the syntax entry has the same immutable data in ESM and CommonJS", () => {
  const commonjs = createRequire(import.meta.url)("@kunstmusik/codemirror-lang-csound/syntax")
  for (const entry of [syntax, commonjs]) {
    assert.deepEqual(entry.csoundNodeNames, syntax.csoundNodeNames)
    assert.deepEqual(entry.csoundNodeGroups, syntax.csoundNodeGroups)
    assert.ok(Object.isFrozen(entry.csoundNodeNames))
    assert.ok(Object.isFrozen(entry.csoundNodeGroups))
    assert.ok(Object.isFrozen(entry.csoundNodeGroups.CsoundIdentifier))
    assert.ok(entry.csoundNodeSet([entry.csoundNodeNames.Identifier]).has("Identifier"))
  }
})
