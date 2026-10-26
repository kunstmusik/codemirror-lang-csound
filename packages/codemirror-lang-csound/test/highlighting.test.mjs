import assert from "node:assert/strict"
import test from "node:test"
import { EditorState } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight"
import { csound } from "@kunstmusik/codemirror-lang-csound"

const highlighter = tagHighlighter([
  { tag: tags.constant(tags.variableName), class: "constant" },
  { tag: tags.variableName, class: "variable" },
])

function highlight(doc, mode) {
  const state = EditorState.create({ doc, extensions: [csound({ mode })] })
  const spans = []
  const tree = syntaxTree(state)
  tree.iterate({ enter(node) { assert.equal(node.type.isError, false, tree.toString()) } })
  highlightTree(tree, highlighter, (from, to, kind) => spans.push({ text: doc.slice(from, to), kind }))
  return spans
}

function documentFor(mode, orchestra) {
  return mode === "orc" ? orchestra : `<CsoundSynthesizer>\n<CsInstruments>\n${orchestra}</CsInstruments>\n</CsoundSynthesizer>\n`
}

for (const mode of ["orc", "csd"]) {
  test(`${mode} highlights complete variables that start with header names`, () => {
    const names = ["krate", "kr1", "kr_rate", "kræft", "srate", "ksmpsValue", "nchnlsValue", "nchnls_input"]
    const orchestra = names.map(name => `${name} = ${name} + 1\n`).join("")
    assert.deepEqual(highlight(documentFor(mode, orchestra), mode),
      names.flatMap(text => [{ text, kind: "variable" }, { text, kind: "variable" }]))
  })

  test(`${mode} still highlights exact header names as constants`, () => {
    const names = ["sr", "kr", "ksmps", "nchnls", "nchnls_i", "0dbfs"]
    const orchestra = names.map(name => `${name} = (${name} + 1)\n`).join("")
    assert.deepEqual(highlight(documentFor(mode, orchestra), mode),
      names.flatMap(text => [{ text, kind: "constant" }, { text, kind: "constant" }]))
  })
}
