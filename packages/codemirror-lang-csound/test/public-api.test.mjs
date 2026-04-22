import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { CompletionContext } from "@codemirror/autocomplete"
import { syntaxTree } from "@codemirror/language"
import { EditorState } from "@codemirror/state"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const indexModuleUrl = pathToFileURL(path.resolve(__dirname, "../dist/index.js")).href
const richModuleUrl = pathToFileURL(path.resolve(__dirname, "../dist/opcodes-rich.js")).href

test("base package exports completion and hover helpers", async () => {
  const module = await import(indexModuleUrl)

  assert.equal(typeof module.csound, "function")
  assert.equal(typeof module.csoundCompletionSource, "function")
  assert.equal(typeof module.csoundHover, "function")
  assert.equal(typeof module.getCsoundHoverInfo, "function")
  assert.equal(typeof module.loadCsoundRichOpcodeCatalog, "function")
  assert.equal(typeof module.analyzeCsoundSemanticLine, "function")
  assert.equal(typeof module.getCsoundSemanticKind, "function")
})

test("completion source includes built-ins and document-local UDOs", async () => {
  const { csoundCompletionSource } = await import(indexModuleUrl)

  const state = EditorState.create({
    doc: [
      "opcode usermix(inp:a):a",
      "  xout inp",
      "endop",
      "",
      "user",
    ].join("\n"),
  })
  const context = new CompletionContext(state, state.doc.length, true)
  const result = csoundCompletionSource(context)

  assert.ok(result)
  assert.ok(result.options.some(option => option.label === "usermix" && option.detail === "UDO"))
  assert.ok(result.options.some(option => option.label === "oscil"))
})

test("hover info returns rich metadata for built-in opcodes", async () => {
  const { getCsoundHoverInfo } = await import(indexModuleUrl)
  const info = await getCsoundHoverInfo("oscili")

  assert.ok(info)
  assert.equal(info.kind, "builtInOpcode")
  assert.equal(info.category, "Signal Generators:Basic Oscillators")
  assert.equal(info.manualPage, "docs/opcodes/oscili.md")
  assert.ok(info.syntax.some(line => line.includes("oscili(")))
  assert.ok(info.signatures.some(signature => signature.outTypes === "a" || signature.outTypes === "k"))
})

test("hover info returns document-local signatures for user opcodes", async () => {
  const { getCsoundHoverInfo } = await import(indexModuleUrl)
  const info = await getCsoundHoverInfo("usermix", {
    documentText: [
      "opcode usermix(inp:a):a",
      "  xout inp",
      "endop",
      "",
      "a1 usermix a2",
    ].join("\n"),
  })

  assert.ok(info)
  assert.equal(info.kind, "userOpcode")
  assert.equal(info.shortDescription, "User-defined opcode in the current document.")
  assert.deepEqual(info.signatures, [{ outTypes: "a", inTypes: "a" }])
})

test("semantic analysis classifies generic opcode lines", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const line = "aL, aR pan2 aSig, 0.5"
  const spans = analyzeCsoundSemanticLine(line)

  assert.deepEqual(
    spans.map(span => ({ text: line.slice(span.from, span.to), kind: span.kind })),
    [
      { text: "aL", kind: "output" },
      { text: "aR", kind: "output" },
      { text: "pan2", kind: "builtInOpcode" },
      { text: "aSig", kind: "input" },
    ],
  )
})

test("semantic analysis classifies old-style opcode lines assigning p-fields", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const line = "p3  limit idur,0.1,10"

  assert.deepEqual(
    analyzeCsoundSemanticLine(line).map(span => ({ text: line.slice(span.from, span.to), kind: span.kind })),
    [
      { text: "p3", kind: "pField" },
      { text: "limit", kind: "builtInOpcode" },
      { text: "idur", kind: "input" },
    ],
  )
})

test("semantic analysis classifies old-style opcode lines with parenthesized first inputs", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const line = "adrydel delay   (1-imix)*adry, idel"

  assert.deepEqual(
    analyzeCsoundSemanticLine(line).map(span => ({ text: line.slice(span.from, span.to), kind: span.kind })),
    [
      { text: "adrydel", kind: "output" },
      { text: "delay", kind: "builtInOpcode" },
      { text: "imix", kind: "input" },
      { text: "adry", kind: "input" },
      { text: "idel", kind: "input" },
    ],
  )
})

test("semantic analysis classifies old-style opcode lines with variable output signatures", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const line = 'aL,aR   diskin  "stereoJungle.wav", 1'

  assert.deepEqual(
    analyzeCsoundSemanticLine(line).map(span => ({ text: line.slice(span.from, span.to), kind: span.kind })),
    [
      { text: "aL", kind: "output" },
      { text: "aR", kind: "output" },
      { text: "diskin", kind: "builtInOpcode" },
    ],
  )
})

test("semantic analysis allows omitted trailing variable outputs", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const line = "asig squinewave a(p4), expon:a(.8, p3, .1), expon:a(.9, p3, .5), 0, 4"

  assert.deepEqual(
    analyzeCsoundSemanticLine(line).map(span => ({ text: line.slice(span.from, span.to), kind: span.kind })),
    [
      { text: "asig", kind: "output" },
      { text: "squinewave", kind: "builtInOpcode" },
      { text: "a", kind: "builtInOpcode" },
      { text: "p4", kind: "pField" },
      { text: "expon:a", kind: "builtInOpcode" },
      { text: "p3", kind: "pField" },
      { text: "expon:a", kind: "builtInOpcode" },
      { text: "p3", kind: "pField" },
    ],
  )
})

test("semantic analysis classifies generic multi-output assignments", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const documentText = [
    "opcode now_tick():i",
    "endop",
    "opcode melodic(itick, kdurs[], kpchs[], kamps[]):(i,i,i)",
    "endop",
  ].join("\n")
  const line = "idur, ipch, iamp = melodic(now_tick(), kdurs, kpchs, kamps)"

  assert.deepEqual(
    analyzeCsoundSemanticLine(line, { documentText }).map(span => ({
      text: line.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "idur", kind: "output" },
      { text: "ipch", kind: "output" },
      { text: "iamp", kind: "output" },
      { text: "melodic", kind: "userOpcode" },
      { text: "now_tick", kind: "userOpcode" },
      { text: "kdurs", kind: "input" },
      { text: "kpchs", kind: "input" },
      { text: "kamps", kind: "input" },
    ],
  )
})

test("semantic analysis classifies user opcodes in generic lines", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const documentText = [
    "opcode usermix(inp:a):a",
    "  xout inp",
    "endop",
    "",
    "a1 usermix a2",
  ].join("\n")
  const line = "a1 usermix a2"
  const spans = analyzeCsoundSemanticLine(line, { documentText })

  assert.deepEqual(
    spans.map(span => ({ text: line.slice(span.from, span.to), kind: span.kind })),
    [
      { text: "a1", kind: "output" },
      { text: "usermix", kind: "userOpcode" },
      { text: "a2", kind: "input" },
    ],
  )
})

test("semantic analysis preserves old-style opcode classification with unary negative inputs", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)

  const negativeLiteralLine = "gk_clock_tick init -1"
  assert.deepEqual(
    analyzeCsoundSemanticLine(negativeLiteralLine).map(span => ({
      text: negativeLiteralLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "gk_clock_tick", kind: "output" },
      { text: "init", kind: "builtInOpcode" },
    ],
  )

  const negativeExpressionLine = "gk_now init -(ksmps / sr)"
  assert.deepEqual(
    analyzeCsoundSemanticLine(negativeExpressionLine).map(span => ({
      text: negativeExpressionLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "gk_now", kind: "output" },
      { text: "init", kind: "builtInOpcode" },
      { text: "ksmps", kind: "input" },
      { text: "sr", kind: "input" },
    ],
  )
})

test("semantic analysis marks inputs for generic function-style opcode lines", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const line = 'schedule("P1", 0, p3, ibeat)'

  assert.deepEqual(
    analyzeCsoundSemanticLine(line).map(span => ({
      text: line.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "schedule", kind: "builtInOpcode" },
      { text: "p3", kind: "pField" },
      { text: "ibeat", kind: "input" },
    ],
  )
})

test("semantic analysis classifies structured function-call statement inputs", async () => {
  const module = await import(indexModuleUrl)
  const line = 'chnset(kauto, "Mix.amp")'
  const state = EditorState.create({
    doc: line,
    extensions: [module.csoundOrcLanguage],
  })
  let hasFunctionCallStatement = false

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "FunctionCallStatement") hasFunctionCallStatement = true
    },
  })

  assert.equal(hasFunctionCallStatement, true)
  assert.deepEqual(
    module.analyzeCsoundSemanticLine(line).map(span => ({
      text: line.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "chnset", kind: "builtInOpcode" },
      { text: "kauto", kind: "input" },
    ],
  )
})

test("semantic analysis classifies typed old-style opcode outputs", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const documentText = [
    "opcode copyPoint(arg:Point):Point",
    "  xout arg",
    "endop",
    "opcode tickValue(inp:i):i",
    "  xout inp",
    "endop",
  ].join("\n")

  const typedUserTypeLine = "retVal:Point copyPoint pointGlobal"
  assert.deepEqual(
    analyzeCsoundSemanticLine(typedUserTypeLine, { documentText }).map(span => ({
      text: typedUserTypeLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "retVal:Point", kind: "output" },
      { text: "copyPoint", kind: "userOpcode" },
      { text: "pointGlobal", kind: "input" },
    ],
  )

  const typedScalarLine = "tick:i tickValue nowTick"
  assert.deepEqual(
    analyzeCsoundSemanticLine(typedScalarLine, { documentText }).map(span => ({
      text: typedScalarLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "tick:i", kind: "output" },
      { text: "tickValue", kind: "userOpcode" },
      { text: "nowTick", kind: "input" },
    ],
  )
})

test("semantic analysis classifies structured assignment opcode calls", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const documentText = [
    "opcode makePoint(arg:Point):Point",
    "  xout arg",
    "endop",
  ].join("\n")

  const builtInLine = "k1 = limit:i(k2, 0, 1)"
  assert.deepEqual(
    analyzeCsoundSemanticLine(builtInLine).map(span => ({
      text: builtInLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "k1", kind: "output" },
      { text: "limit:i", kind: "builtInOpcode" },
      { text: "k2", kind: "input" },
    ],
  )

  const userOpcodeLine = "point2:Point = makePoint(pointGlobal)"
  assert.deepEqual(
    analyzeCsoundSemanticLine(userOpcodeLine, { documentText }).map(span => ({
      text: userOpcodeLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "point2:Point", kind: "output" },
      { text: "makePoint", kind: "userOpcode" },
      { text: "pointGlobal", kind: "input" },
    ],
  )
})

test("semantic analysis classifies plain and indexed assignments", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)

  const plainLine = "a1 = a2 + a3"
  assert.deepEqual(
    analyzeCsoundSemanticLine(plainLine).map(span => ({
      text: plainLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "a1", kind: "output" },
      { text: "a2", kind: "input" },
      { text: "a3", kind: "input" },
    ],
  )

  const compoundLine = "gk_now += kstep"
  assert.deepEqual(
    analyzeCsoundSemanticLine(compoundLine).map(span => ({
      text: compoundLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "gk_now", kind: "output" },
      { text: "kstep", kind: "input" },
    ],
  )

  const indexedLine = "ga_sbus[ibus][0] = ga_sbus[ibus][0] + al"
  assert.deepEqual(
    analyzeCsoundSemanticLine(indexedLine).map(span => ({
      text: indexedLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "ga_sbus", kind: "output" },
      { text: "ibus", kind: "input" },
      { text: "ga_sbus", kind: "input" },
      { text: "ibus", kind: "input" },
      { text: "al", kind: "input" },
    ],
  )

  const pFieldLine = "p3 = p3 + 1"
  assert.deepEqual(
    analyzeCsoundSemanticLine(pFieldLine).map(span => ({
      text: pFieldLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "p3", kind: "pField" },
      { text: "p3", kind: "pField" },
    ],
  )
})

test("semantic analysis classifies return payloads without coloring control keywords", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const documentText = [
    "opcode makePoint(arg:Point):Point",
    "  xout arg",
    "endop",
  ].join("\n")

  const plainReturnLine = "return Smsg"
  assert.deepEqual(
    analyzeCsoundSemanticLine(plainReturnLine).map(span => ({
      text: plainReturnLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [{ text: "Smsg", kind: "input" }],
  )

  const callReturnLine = "return makePoint(pointGlobal)"
  assert.deepEqual(
    analyzeCsoundSemanticLine(callReturnLine, { documentText }).map(span => ({
      text: callReturnLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "makePoint", kind: "userOpcode" },
      { text: "pointGlobal", kind: "input" },
    ],
  )

  assert.deepEqual(analyzeCsoundSemanticLine("rireturn").map(span => span.kind), [])
})

test("semantic analysis uses document context for multiline generic-line continuations", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const documentText = [
    'prints(sprintf("Cleared instrument definition: %s\\n", ',
    "  Sinstr))",
  ].join("\n")
  const continuationLine = "  Sinstr))"
  const offset = documentText.indexOf(continuationLine)

  assert.deepEqual(
    analyzeCsoundSemanticLine(continuationLine, { documentText, offset }).map(span => ({
      text: documentText.slice(span.from, span.to),
      kind: span.kind,
    })),
    [{ text: "Sinstr", kind: "input" }],
  )
})

test("semantic analysis resolves deep multiline generic-line continuations locally", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const continuationArgs = Array.from({ length: 24 }, (_, index) => `  S${index},`)
  const documentText = [
    'prints(sprintf("%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s%s",',
    ...continuationArgs,
    "  Sinstr))",
  ].join("\n")
  const continuationLine = "  Sinstr))"
  const offset = documentText.indexOf(continuationLine)

  assert.deepEqual(
    analyzeCsoundSemanticLine(continuationLine, { documentText, offset }).map(span => ({
      text: documentText.slice(span.from, span.to),
      kind: span.kind,
    })),
    [{ text: "Sinstr", kind: "input" }],
  )
})

test("semantic analysis classifies old-style opcode lines with indexed outputs", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)

  const indexedInitLine = "kout[iwriteIndx] init iv"
  assert.deepEqual(
    analyzeCsoundSemanticLine(indexedInitLine).map(span => ({
      text: indexedInitLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "kout", kind: "output" },
      { text: "iwriteIndx", kind: "input" },
      { text: "init", kind: "builtInOpcode" },
      { text: "iv", kind: "input" },
    ],
  )

  const opcodeNameCollisionLine = "out[ndx] init kin"
  assert.deepEqual(
    analyzeCsoundSemanticLine(opcodeNameCollisionLine).map(span => ({
      text: opcodeNameCollisionLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "out", kind: "output" },
      { text: "ndx", kind: "input" },
      { text: "init", kind: "builtInOpcode" },
      { text: "kin", kind: "input" },
    ],
  )
})

test("semantic analysis classifies opcode calls inside control-flow conditions without bogus variables", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const documentText = [
    "opcode contains(ival, iarr[]):i",
    "  xout ival",
    "endop",
  ].join("\n")

  const builtInLine = "if(random(0,1) < limit:i(iamount, 0, 1)) then"
  assert.deepEqual(
    analyzeCsoundSemanticLine(builtInLine).map(span => ({
      text: builtInLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "random", kind: "builtInOpcode" },
      { text: "limit:i", kind: "builtInOpcode" },
      { text: "iamount", kind: "input" },
    ],
  )

  const userOpcodeLine = "if(contains(ipc + indx, iscale) == 1) then"
  assert.deepEqual(
    analyzeCsoundSemanticLine(userOpcodeLine, { documentText }).map(span => ({
      text: userOpcodeLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "contains", kind: "userOpcode" },
      { text: "ipc", kind: "input" },
      { text: "indx", kind: "input" },
      { text: "iscale", kind: "input" },
    ],
  )

  const plainConditionLine = "if(gk_clock_internal + kstep16th >= 1.0 ) then"
  assert.deepEqual(
    analyzeCsoundSemanticLine(plainConditionLine).map(span => ({
      text: plainConditionLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "gk_clock_internal", kind: "input" },
      { text: "kstep16th", kind: "input" },
    ],
  )
})

test("semantic analysis classifies plain identifiers inside loop and branch conditions", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)

  const indexedIfLine = "if (iarr[indx] == ival) then"
  assert.deepEqual(
    analyzeCsoundSemanticLine(indexedIfLine).map(span => ({
      text: indexedIfLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "iarr", kind: "input" },
      { text: "indx", kind: "input" },
      { text: "ival", kind: "input" },
    ],
  )

  const whileLine = "while (indx < lenarray:i(iarr)) do"
  assert.deepEqual(
    analyzeCsoundSemanticLine(whileLine).map(span => ({
      text: whileLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "indx", kind: "input" },
      { text: "lenarray:i", kind: "builtInOpcode" },
      { text: "iarr", kind: "input" },
    ],
  )

  const elseifLine = "elseif (icur > tick) ithen"
  assert.deepEqual(
    analyzeCsoundSemanticLine(elseifLine).map(span => ({
      text: elseifLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "icur", kind: "input" },
      { text: "tick", kind: "input" },
    ],
  )
})

test("semantic analysis ignores member field segments in old-style inputs", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)

  const memberAccessLine = "retVal:Point init arg1.x + 1, arg1.y + 1"
  assert.deepEqual(
    analyzeCsoundSemanticLine(memberAccessLine).map(span => ({
      text: memberAccessLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "retVal:Point", kind: "output" },
      { text: "init", kind: "builtInOpcode" },
      { text: "arg1", kind: "input" },
      { text: "arg1", kind: "input" },
    ],
  )

  const arrayMemberLine = "a1 init p(points[0].x)"
  assert.deepEqual(
    analyzeCsoundSemanticLine(arrayMemberLine).map(span => ({
      text: arrayMemberLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "a1", kind: "output" },
      { text: "init", kind: "builtInOpcode" },
      { text: "p", kind: "builtInOpcode" },
      { text: "points", kind: "input" },
    ],
  )
})

test("semantic analysis classifies UDO and named-instrument definitions", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const opcodeLine = "opcode declik(ain):a"
  const instrLine = "instr P1, OtherImpl"

  assert.deepEqual(
    analyzeCsoundSemanticLine(opcodeLine).map(span => ({
      text: opcodeLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [{ text: "declik", kind: "userOpcode" }],
  )

  assert.deepEqual(
    analyzeCsoundSemanticLine(instrLine).map(span => ({
      text: instrLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "P1", kind: "instrumentName" },
      { text: "OtherImpl", kind: "instrumentName" },
    ],
  )
})

test("semantic analysis skips xout keyword and highlights its payload", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)
  const line = "xout i(gk_tempo)"

  assert.deepEqual(
    analyzeCsoundSemanticLine(line).map(span => ({
      text: line.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "i", kind: "builtInOpcode" },
      { text: "gk_tempo", kind: "input" },
    ],
  )
})

test("semantic analysis marks plain xout payload identifiers and legacy xin lists", async () => {
  const { analyzeCsoundSemanticLine } = await import(indexModuleUrl)

  const xoutLine = "xout idur, p3, asig"
  assert.deepEqual(
    analyzeCsoundSemanticLine(xoutLine).map(span => ({
      text: xoutLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "idur", kind: "output" },
      { text: "p3", kind: "pField" },
      { text: "asig", kind: "output" },
    ],
  )

  const xinLine = "i1, p2, a1 xin"
  assert.deepEqual(
    analyzeCsoundSemanticLine(xinLine).map(span => ({
      text: xinLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "i1", kind: "output" },
      { text: "p2", kind: "pField" },
      { text: "a1", kind: "output" },
    ],
  )

  const uppercasePFieldLikeLine = "a1 = P3 + p4"
  assert.deepEqual(
    analyzeCsoundSemanticLine(uppercasePFieldLikeLine).map(span => ({
      text: uppercasePFieldLikeLine.slice(span.from, span.to),
      kind: span.kind,
    })),
    [
      { text: "a1", kind: "output" },
      { text: "P3", kind: "input" },
      { text: "p4", kind: "pField" },
    ],
  )
})

test("score opcode highlighting separates event letters from p1 suffixes", async () => {
  const { csoundScoLanguage, scoreOpcodeEventTypeRange, scoreOpcodePFieldNumberRange } =
    await import(indexModuleUrl)
  const text = [
    "i1 0 .5 + np^3 pp^4 $MACRO(1'2)",
    "f1 0 8192 10 1",
    "t 0 60 40 120",
    "s",
    "e",
    "",
  ].join("\n")

  const state = EditorState.create({ doc: text, extensions: [csoundScoLanguage] })
  const tree = syntaxTree(state)
  const highlights = []
  tree.iterate({
    enter(node) {
      if (node.name !== "ScoreOpcode") return
      const opcode = text.slice(node.from, node.to)
      const eventRange = scoreOpcodeEventTypeRange(node.from, node.to)
      const pfieldRange = scoreOpcodePFieldNumberRange(opcode, node.from)
      assert.ok(eventRange)
      highlights.push({
        opcode,
        event: text.slice(eventRange.from, eventRange.to),
        p1: pfieldRange ? text.slice(pfieldRange.from, pfieldRange.to) : null,
      })
    },
  })

  assert.deepEqual(highlights, [
    { opcode: "i1", event: "i", p1: "1" },
    { opcode: "f1", event: "f", p1: "1" },
    { opcode: "t", event: "t", p1: null },
    { opcode: "s", event: "s", p1: null },
    { opcode: "e", event: "e", p1: null },
  ])
})

test("score relative p-fields and macro arguments expose numeric highlight ranges", async () => {
  const { csoundScoLanguage, macroArgumentNumberRanges } = await import(indexModuleUrl)
  const text = "i1 0 .5 + np^3 pp^4 $MACRO(1'2)\n"

  const state = EditorState.create({ doc: text, extensions: [csoundScoLanguage] })
  const tree = syntaxTree(state)
  const relativeNames = []
  const numberNodes = []
  const macroNumbers = []

  tree.iterate({
    enter(node) {
      const value = text.slice(node.from, node.to)
      if (node.name === "ScoreRelativePFieldName") relativeNames.push(value)
      if (node.name === "Number") numberNodes.push(value)
      if (node.name === "MacroUsageToken") {
        for (const range of macroArgumentNumberRanges(value, node.from)) {
          macroNumbers.push(text.slice(range.from, range.to))
        }
      }
    },
  })

  assert.deepEqual(relativeNames, ["np", "pp"])
  assert.deepEqual(numberNodes, ["0", ".5", "3", "4"])
  assert.deepEqual(macroNumbers, ["1", "2"])
})

test("semantic kind helper supports structured call classification", async () => {
  const module = await import(indexModuleUrl)
  const documentText = [
    "opcode usermix(inp:a):a",
    "  xout inp",
    "endop",
    "",
    "instr 1",
    "  k1 = limit:i(k2, 0, 1)",
    "  a1 = usermix(a2)",
    "endin",
    "",
  ].join("\n")

  const state = EditorState.create({
    doc: documentText,
    extensions: [module.csound({ mode: "orc", semanticHighlighting: false, hover: false })],
  })

  const callees = []
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "FunctionCallee") {
        callees.push(state.doc.sliceString(node.from, node.to))
      }
    },
  })

  const semanticKinds = new Map(
    callees.map(name => [name, module.getCsoundSemanticKind(name, { documentText })]),
  )

  assert.equal(semanticKinds.get("limit:i"), "builtInOpcode")
  assert.equal(semanticKinds.get("usermix"), "userOpcode")
})

test("rich entrypoint exposes manual metadata directly", async () => {
  const richModule = await import(richModuleUrl)

  assert.ok(richModule.csoundRichOpcodeCatalog)
  const oscili = richModule.getCsoundRichOpcodeEntry("oscili")
  assert.ok(oscili)
  assert.equal(oscili.manualPage, "docs/opcodes/oscili.md")
  assert.ok(oscili.examples.length > 0)
})
