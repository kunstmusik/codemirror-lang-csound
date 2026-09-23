import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
import { EditorState } from "@codemirror/state"
import { syntaxTree, indentUnit } from "@codemirror/language"
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight"
import * as core from "@kunstmusik/codemirror-lang-csound"
import * as compat from "@kunstmusik/codemirror-lang-csound/compat"

test("compat is a separate language-only entry in ESM and CommonJS", async () => {
  const require = createRequire(import.meta.url)
  for (const [language, adapter] of [[core, compat], [require("@kunstmusik/codemirror-lang-csound"), require("@kunstmusik/codemirror-lang-csound/compat")]]) {
    for (const name of ["csoundMode", "csdLanguage", "orcLanguage", "scoLanguage", "csoundSynopsis", "csoundLegacyTheme", "csoundLegacyHighlighting"]) {
      assert.equal(name in language, false, name + " leaked into the core entry")
    }
    assert.deepEqual(Object.keys(adapter).sort(), ["csdLanguage", "csoundMode", "orcLanguage", "scoLanguage"])
    assert.equal(adapter.csdLanguage, language.csoundCsdLanguage)
    assert.equal(adapter.orcLanguage, language.csoundOrcLanguage)
    assert.equal(adapter.scoLanguage, language.csoundScoLanguage)
    const support = adapter.csoundMode()
    assert.equal(support.language, language.csoundCsdLanguage)
    assert.deepEqual(support.support, [])
    assert.equal(language.csound().support.length, 2)
    assert.deepEqual(language.csound({ semanticHighlighting: false, hover: false }).support, [])
  }
})

test("core and compat share mode and completion options without overriding host indentation", () => {
  for (const mode of ["csd", "orc", "sco"]) {
    for (const completion of [true, false]) {
      for (const support of [core.csound({ mode, completion }), compat.csoundMode({ fileType: mode, enableCompletion: completion })]) {
        const state = EditorState.create({ extensions: [support, indentUnit.of("    ")] })
        assert.equal(state.languageDataAt("autocomplete", 0).length, completion ? 1 : 0)
        assert.equal(state.facet(indentUnit), "    ")
        assert.equal(support.language.name, "csound-" + mode)
      }
    }
  }
})

test("0dbfs highlights as one constant with standard CodeMirror themes", () => {
  const doc = "0dbfs = 1\n"
  const state = EditorState.create({ doc, extensions: [core.csound({ mode: "orc" })] })
  const spans = []
  highlightTree(syntaxTree(state), tagHighlighter([{ tag: tags.constant(tags.variableName), class: "constant" }]),
    (from, to) => spans.push(doc.slice(from, to)))
  assert.deepEqual(spans, ["0dbfs"])
})
