import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { parser } from "../src/parser.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const trappedCsdPath = path.resolve(
  __dirname,
  "../../demo/src/assets/trapped.csd",
)
const livecodeOrcPath = path.resolve(
  __dirname,
  "fixtures/livecode.orc",
)
const opcodeCatalogPath = path.resolve(
  __dirname,
  "../src/opcodes.json",
)
const richOpcodeCatalogPath = path.resolve(
  __dirname,
  "../src/opcodes-rich.json",
)

function countErrors(tree) {
  let count = 0
  tree.iterate({
    enter(node) {
      if (node.type.isError) count += 1
    },
  })
  return count
}

function countNodes(tree, name) {
  let count = 0
  tree.iterate({
    enter(node) {
      if (node.name === name) count += 1
    },
  })
  return count
}

test("bundled trapped.csd parses without errors", () => {
  const text = fs.readFileSync(trappedCsdPath, "utf8")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
})

test("csd prelude and license blocks parse as flat content", () => {
  const text = [
    "; comments and notes before the real CSD document",
    "Plain preamble text should not force recovery.",
    "",
    "<CsoundSynthesizer>",
    "<CsLicense>",
    "License prose can contain punctuation, keywords in text, and Link's notes.",
    "</CsLicense>",
    "<CsOptions>",
    "-odac",
    "</CsOptions>",
    "<CsInstruments>",
    "instr 1",
    "endin",
    "</CsInstruments>",
    "<CsScore>",
    "i1 0 1",
    "</CsScore>",
    "</CsoundSynthesizer>",
    "Output text can contain a loose \" character.",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "CsdPrelude"), 1)
  assert.equal(countNodes(tree, "LicenseBlock"), 1)
})

test("csd files accept bare option lines between top-level blocks", () => {
  const text = [
    "<CsoundSynthesizer>",
    "-+rtaudio=dummy",
    "<CsInstruments>",
    "instr 1",
    "endin",
    "</CsInstruments>",
    "<CsScore>",
    "i1 0 1",
    "</CsScore>",
    "</CsoundSynthesizer>",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "InstrumentsBlock"), 1)
  assert.equal(countNodes(tree, "ScoreBlock"), 1)
})

test("basic orchestra parses without errors", () => {
  const text = ["instr 1", "a1 oscil 0.5, 440, 1", "endin", ""].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
})

test("orchestra token extensions parse without errors", () => {
  const text = [
    "sr = 48000",
    "ksmps = 32",
    "0dbfs = 1",
    "instr 1",
    "// alternate line comment",
    "/**** block comments can contain * runs and / slashes ****/",
    "Smsg = {{hello, raw braces}}",
    "Smsg2 = R{hello, raw r string}R",
    "aOut oscil .5, p3, 1",
    "name:Type = p4",
    "gkGlobal = p5",
    "if p3 > .5 then",
    "xout aOut",
    "endif",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
})

test("banner-style block comments in CSD prelude parse without recovery", () => {
  const text = [
    "/****************************************************************************",
    "iftlen - the length of the elements written to the function table (usually this equals the length of the function table; just an empty string as input will create a function table of size=1 but with iftlen=0)",
    "****************************************************************************/",
    "",
    "<CsoundSynthesizer>",
    "<CsOptions>",
    "</CsOptions>",
    "<CsInstruments>",
    "instr 1",
    "endin",
    "</CsInstruments>",
    "<CsScore>",
    "</CsScore>",
    "</CsoundSynthesizer>",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "BlockComment"), 1)
})

test("csd comments keep backslash text and string escapes as ordinary content", () => {
  const text = [
    "<CsoundSynthesizer>",
    "<CsOptions>",
    "</CsOptions>",
    "<CsInstruments>",
    "sr = 44100",
    "ksmps = 1",
    "nchnls = 1",
    "; \\\\n is used to denote \"new line\"",
    'strset 1, "String 1\\\\n"',
    'strset 2, "String 2\\\\n"',
    "instr 1",
    "Str strget p4",
    "prints Str",
    "endin",
    "</CsInstruments>",
    "<CsScore>",
    "i 1 0 1 1",
    "e",
    "</CsScore>",
    "</CsoundSynthesizer>",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
})

test("trailing CSD output text accepts literal hash characters", () => {
  const text = [
    "<CsoundSynthesizer>",
    "<CsOptions>",
    "</CsOptions>",
    "<CsInstruments>",
    "instr 1",
    "endin",
    "</CsInstruments>",
    "<CsScore>",
    "e",
    "</CsScore>",
    "</CsoundSynthesizer>",
    "",
    "returns:",
    "ift# = 101, iftlen = 7",
    "[9  =  #  U  ]",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
})

test("nested R raw strings parse without recovery", () => {
  const text = [
    "instr 1",
    'prints R{ "type": "checkBox",',
    '            "bounds":{"left":%d, "top":%d, "width":30, "height":30},',
    '            "channels": [{"id": "check%d", "range": {"defaultValue": 0}}],',
    '            "style": {',
    '            "on": {"backgroundColor": "#ffa71e"},',
    '            "off": {"backgroundColor": "#d5d5d5ff"}',
    '            }',
    '            }',
    '            R{ %s }R \\n}R, 1, 1, 1, "embedded string"',
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
})

test("nested brace raw strings parse without recovery", () => {
  const text = [
    "instr 1",
    "ires compilestr {{",
    "prints {{test string",
    "}}",
    "}}",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
})

test("structured orchestra expressions parse ternary and nested array access", () => {
  const text = [
    "instr 1",
    "if (p4 > 0 ? p4 : 1) > 0 then",
    "if gaBus[p5][0] == 0 then",
    "endif",
    "endif",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.ok(countNodes(tree, "OrcConditionalExpr") > 0)
  assert.equal(countNodes(tree, "ArrayIndex"), 2)
})

test("structured orchestra expressions accept bitwise xor", () => {
  const text = [
    "instr 1",
    "iv = (p4 | (p4 << 1) # (p4 << 2)) & 0x7",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.ok(countNodes(tree, "OrcBitXorExpr") >= 1)
})

test("structured orchestra expressions accept legacy unary not", () => {
  const text = [
    "instr 1",
    "inum1 = 5",
    "iansw1 = ¬inum1",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.ok(countNodes(tree, "OrcUnaryExpr") >= 1)
})

test("array indexes parse slices and multi-index access", () => {
  const text = [
    "instr 1",
    "sl:i[] = arr[0 : 4, 2]",
    "i2[] = i1[2:]",
    "i3[] = i1[:2]",
    "ival = matrix[1, 2]",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "ArrayIndex"), 4)
  assert.equal(countNodes(tree, "ArraySliceExpr"), 3)
})

test("structured orchestra statements parse labels and safe assignments", () => {
  const text = [
    "instr 1",
    "start:",
    "a1 = oscili(0.5, 440)",
    "k1 += 0.1",
    "p3 = p3 + 1",
    "a1_ = a1 - a1_",
    "aL, aR pan2 a1, 0.5",
    "if k1 > 0 goto start",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "LabelStatement"), 1)
  assert.equal(countNodes(tree, "AssignmentStatement"), 4)
  assert.equal(countNodes(tree, "OrcGenericLine"), 1)
})

test("old-style opcode lines can use in as an opcode name", () => {
  const text = [
    "instr 1",
    "  asig in",
    "  asig2 in 1",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "OrcGenericLine"), 2)
})

test("old-style opcode lines accept pitch-name operands", () => {
  const text = [
    "instr 1",
    "  asig[] init 2",
    "  asig[0] oscil 0dbfs/2, A4",
    "  asig[1] oscil 0dbfs/2, A4/2",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
})

test("labels can share a line with old-style opcode statements", () => {
  const text = [
    "instr 1",
    "start:",
    "noise: asig rand 1",
    "end: xout icount",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "LabelStatement"), 3)
  assert.equal(countNodes(tree, "OrcGenericLine"), 1)
  assert.equal(countNodes(tree, "XoutStatement"), 1)
})

test("conditions accept legacy single-equals comparisons", () => {
  const text = [
    "instr 1",
    "if (1 = 1) kgoto testLabel",
    "if (ival > 0.) goto testLabel",
    "testLabel:",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "IfStatement"), 2)
  assert.equal(countNodes(tree, "GotoStatement"), 2)
})

test("until loops accept enduntil terminators", () => {
  const text = [
    "instr 1",
    "  ix = 0",
    "  until ix >= 3 do",
    "    ix += 1",
    "  enduntil",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "UntilLoop"), 1)
})

test("switch statements tolerate blank lines around cases", () => {
  const text = [
    "opcode switch_xout_value, i, i",
    "  iCond xin",
    "  switch iCond",
    "  ",
    "    case 1",
    "      iOut = 11",
    "      ",
    "    case 2",
    "      iOut = 22",
    "      ",
    "    default",
    "      iOut = 0",
    "  endsw",
    "  xout iOut",
    "endop",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "SwitchStatement"), 1)
  assert.equal(countNodes(tree, "CaseBlock"), 2)
  assert.equal(countNodes(tree, "DefaultBlock"), 1)
})

test("instrument ids accept lowercase p-fields and plus-prefixed names", () => {
  const text = [
    "instr p1",
    "endin",
    "",
    "instr +MyInstr",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "InstrumentDefinition"), 2)
  assert.equal(countNodes(tree, "PField"), 1)
  assert.equal(countNodes(tree, "PlusInstrId"), 1)
})

test("instrument ids accept uppercase P1-style names as identifiers", () => {
  const text = [
    "instr P1",
    "endin",
    "",
    "instr P1_if",
    "endin",
    "",
    "instr P1_ternary",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "InstrumentDefinition"), 3)
  assert.equal(countNodes(tree, "PField"), 0)
})

test("structured expressions parse multiline calls and header-prefixed identifiers", () => {
  const text = [
    "instr 1",
    "Smsg = sprintf(\"Cleared instrument definition: %s\\n\",",
    "  Sinstr)",
    "aout = al * krvb + ar * krvb",
    "return Smsg",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "AssignmentStatement"), 2)
  assert.equal(countNodes(tree, "OrcCallExprList"), 1)
  assert.equal(countNodes(tree, "HeaderPrefixedIdentifier"), 2)
  assert.equal(countNodes(tree, "ReturnStatement"), 1)
  assert.equal(countNodes(tree, "OrcGenericLine"), 0)
})

test("structured expressions allow bare newline continuations after infix operators", () => {
  const text = [
    "instr 1",
    "a1 = vco2(p4/3, p5) +",
    "     vco2(p4/3, p5*1.01) +",
    "     vco2(p4/3, p5*0.99)",
    "out a1",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "AssignmentStatement"), 1)
  assert.equal(countNodes(tree, "FunctionCallExpr"), 3)
  assert.equal(countNodes(tree, "OrcGenericLine"), 1)
})

test("generic lines allow continuations with trailing comments", () => {
  const text = [
    "giseq ftgen 0,0,128,-2, 2, 0, 0.5, 8.00,\\\t\t;first note",
    "            2, 1, 0.5, 8.02,\\\t\t;second note",
    "            2, 2, 0.5, 8.04",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "OrcGenericLine"), 1)
})

test("function-style opcode calls parse structurally", () => {
  const text = [
    "instr 1",
    "schedule(\"P1\", 0, p3, ibeat)",
    "out(a1, a2)",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "FunctionCallStatement"), 2)
  assert.equal(countNodes(tree, "OrcGenericLine"), 0)
})

test("function-call results can be indexed as arrays", () => {
  const text = [
    "instr 1",
    "  String = toStrArray(\"Inline string-array get\")[0]",
    "  iresultVal = toInitArray(123.456)[0]",
    "  print(explicitReturn()[2])",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "ArrayAccessExpr"), 3)
})

test("legacy UDO signatures and xin lines parse without recovery", () => {
  const text = [
    "opcode test, iia, iia",
    "  i1, i2, a1 xin",
    "",
    "  xout i1, i2, a1",
    "endop",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "LegacyUdo"), 1)
  assert.equal(countNodes(tree, "UdoArgTypes"), 2)
  assert.equal(countNodes(tree, "OrcGenericLine"), 1)
  assert.equal(countNodes(tree, "XoutStatement"), 1)
})

test("legacy UDO names can use uppercase legacy identifiers", () => {
  const text = [
    "opcode SVF,a,akk",
    "endop",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "LegacyUdo"), 1)
})

test("legacy UDO signatures accept arrays and quoted type strings", () => {
  const text = [
    "opcode one_dim, 0, k[]",
    "kArr[] xin",
    "endop",
    "",
    "opcode two_dim, 0, k[][]",
    "kArr[][] xin",
    "endop",
    "",
    "opcode PrtArr1i, 0, i[]ojjj",
    "iArr[], istart, iend, iprec, ippr xin",
    "endop",
    "",
    "opcode test3, \"i[]i\", \"i[]\"",
    "i1[] xin",
    "endop",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "LegacyUdo"), 4)
  assert.equal(countNodes(tree, "String"), 2)
  assert.ok(countNodes(tree, "ArraySuffix") >= 1)
})

test("cs7 user-defined type syntax parses without recovery", () => {
  const text = [
    "<CsoundSynthesizer>",
    "<CsInstruments>",
    "struct Point x:i, y:i",
    "struct Rectangle topLeft:Point, width:i, height:i",
    "pointGlobal@global:Point init 1, 2",
    "",
    "declare makePoint(arg1:Point):(Point)",
    "",
    "opcode makePoint(arg1:Point):Point",
    "  retVal:Point init arg1.x + 1, arg1.y + 1",
    "  xout(retVal)",
    "endop",
    "",
    "instr 1",
    "  points:Point[] init 2",
    "  points[0].x = pointGlobal.x",
    "  i0 = points[0].x",
    "  point2:Point = makePoint(pointGlobal)",
    "  print(point2.y)",
    "endin",
    "</CsInstruments>",
    "<CsScore>",
    "i1 0 1",
    "</CsScore>",
    "</CsoundSynthesizer>",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "StructDefinition"), 2)
  assert.equal(countNodes(tree, "GlobalTypedIdentifier"), 1)
  assert.ok(countNodes(tree, "MemberAccessExpr") >= 1)
  assert.equal(countNodes(tree, "ModernUdo"), 1)
})

test("cs7 typed array and generated array syntax parses without recovery", () => {
  const text = [
    "instr 1",
    "  source:k[] = [phasor:k(0.3) * 360, 0.0]",
    "  gains:k[] = dbapgains:k[](1, source, [0, 0, 45, 0], 3, 24.0)",
    "  for var:S, ndx:k in [\"1\", \"2\", \"3\"] do",
    "    print ndx",
    "  od",
    "  for k in [0 ... lenarray(source)-1] do",
    "    print k",
    "  od",
    "endin",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.ok(countNodes(tree, "TypedArrayIdentifier") >= 2)
  assert.equal(countNodes(tree, "ArrayRangeExpr"), 1)
  assert.equal(countNodes(tree, "ForLoop"), 2)
})

test("cs7 live-code orchestra fixture parses without errors", () => {
  const text = fs.readFileSync(livecodeOrcPath, "utf8")
  const tree = parser.configure({ top: "OrchestraFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "ModernUdo"), 90)
  assert.equal(countNodes(tree, "InstrumentDefinition"), 56)
  assert.ok(countNodes(tree, "AssignmentStatement") > 500)
  assert.equal(countNodes(tree, "LabelStatement"), 3)
  assert.equal(countNodes(tree, "ArrayIdentifier"), 41)
  assert.equal(countNodes(tree, "HeaderPrefixedIdentifier"), 6)
})

test("score token extensions parse without errors", () => {
  const text = [
    "// score comment",
    "i1 0 .5 + np^3 pp^4 $MACRO(1'2)",
    "i2 1 [0.25 + (p3 * 2)] [sin(0.5) + (~ * 0.1)]",
    "f20 0 16 -2 .001",
    "t 0 60 40 120",
    "s",
    "e",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "ScoreFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "ScoreStatementLine"), 6)
  assert.equal(countNodes(tree, "ScoreOpcode"), 6)
  assert.equal(countNodes(tree, "ScoreField"), 17)
  assert.equal(countNodes(tree, "ScoreBracketExpr"), 2)
  assert.equal(countNodes(tree, "ScoreFunctionCallExpr"), 1)
  assert.equal(countNodes(tree, "ScoreRelativePField"), 2)
  assert.equal(countNodes(tree, "ScoreCarry"), 1)
})

test("score carry, ramp, and relative-time fields parse without errors", () => {
  const text = [
    "i1 2 8 60.00 60",
    "i1 ^+10 8 72.00 60",
    "i2 + . >",
    "i. + . . 448 <",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "ScoreFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "ScoreStatementLine"), 4)
  assert.equal(countNodes(tree, "ScoreRelativeTime"), 1)
  assert.equal(countNodes(tree, "ScoreCarry"), 8)
})

test("score tables accept wrapped numeric continuation lines", () => {
  const text = [
    "f1 0 32 -2 6.00 6.02 6.04 6.05 6.07 6.09 6.11",
    "   7.00 7.02 7.04 7.05 7.07 7.09 7.11",
    "   8.00 8.02 8.04 8.05 8.07 8.09 8.11",
    "   9.00 9.02 9.04 9.05 9.07 9.09 9.11",
    "e",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "ScoreFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "ScoreContinuationLine"), 3)
})

test("score carry bang parses as a carry token", () => {
  const text = [
    "i1 4 2 0.0 0.5 0.0 !",
    "i1 8 10 0.0 3.0 1.0 0.3 0.1 0.3 1.0 0.3 0.1 0.3 1.0 0.3 0.1 0.8 0.9 5.0 0.0",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "ScoreFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "ScoreCarry"), 1)
})

test("score note names parse as simple field atoms", () => {
  const text = [
    "i101 E5",
    "i102 b4 C#4",
    "i102 b4 Bb3",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "ScoreFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "ScoreSharpNote"), 1)
})

test("CsScore bin=csbeats blocks parse as flat content", () => {
  const text = [
    "<CsoundSynthesizer>",
    "<CsInstruments>",
    "instr 1",
    "endin",
    "</CsInstruments>",
    '<CsScore bin="csbeats">',
    "beats = 100",
    "permeasure = 4",
    "i101    m1 b1   q    mp   D3",
    "i101                      F3",
    "</CsScore>",
    "</CsoundSynthesizer>",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "CsbeatsScoreBlock"), 1)
})

test("score expressions accept standalone tilde terms", () => {
  const text = [
    "i1 0 1 [500 + (~ * 200)]",
    "i1 0 1 [.04 + (~ * .02)]",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "ScoreFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.ok(countNodes(tree, "ScoreTilde") >= 2)
})

test("score nested brace loops parse without errors", () => {
  const text = [
    "f1 0 4096 10 1",
    "{ 4 CNT",
    "  { 8 PARTIAL",
    "      i1 1 2 3 4",
    "  }",
    "  i2 0 6",
    "}",
    "e",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "ScoreFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.ok(countNodes(tree, "ScoreNestableLoop") >= 2)
})

test("score brace loop macros accept trailing dots", () => {
  const text = [
    "f1 0 4096 10 1",
    "{ 4 CNT",
    "  { 8 PARTIAL",
    "      i1 [0.5 * $CNT.] [1 + ($CNT * 0.2)] [.04 + (~ * .02)] [800 + (200 * $CNT.) + ($PARTIAL. * 20)]",
    "  }",
    "}",
    "e",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "ScoreFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.ok(countNodes(tree, "ScoreNestableLoop") >= 2)
})

test("score brace loop headers accept macro names", () => {
  const text = [
    "f1 0 4096 10 1",
    "{ 3 $FOO",
    "  i1 0 0.1 440",
    "  i2 0 0.1 220",
    "  i1 0 0.1 110",
    "  i2 0 0.1 330",
    "}",
    "e",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "ScoreFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "ScoreNestableLoop"), 1)
})

test("orchestra lines accept do labels and operands", () => {
  const text = [
    "<CsoundSynthesizer>",
    "<CsInstruments>",
    "sr = 48000",
    "ksmps = 10",
    "0dbfs = 1",
    "instr 3",
    "idur random .3, 1.5",
    "timout 0, idur, do",
    "reinit loop",
    "do:",
    "ifreq random 400, 1200",
    "endin",
    "</CsInstruments>",
    "<CsScore>",
    "i1 0 1",
    "</CsScore>",
    "</CsoundSynthesizer>",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
})

test("preprocessor directives parse structurally", () => {
  const orc = [
    "#include \"shared.orc\"",
    "#define SCALE(x) x + 1",
    "#ifdef USE_ONE",
    "instr 1",
    "endin",
    "#else",
    "instr 2",
    "endin",
    "#end",
    "",
  ].join("\n")
  const orcTree = parser.configure({ top: "OrchestraFile" }).parse(orc)
  assert.equal(countErrors(orcTree), 0)
  assert.equal(countNodes(orcTree, "IncludeDirective"), 1)
  assert.equal(countNodes(orcTree, "DefineDirective"), 1)
  assert.equal(countNodes(orcTree, "DefineBody"), 1)
  assert.equal(countNodes(orcTree, "OrcIfdefDirective"), 1)

  const sco = [
    "#define PLAY 1",
    "#ifdef PLAY",
    "i1 0 1",
    "#else",
    "e",
    "#end",
    "",
  ].join("\n")
  const scoTree = parser.configure({ top: "ScoreFile" }).parse(sco)
  assert.equal(countErrors(scoTree), 0)
  assert.equal(countNodes(scoTree, "ScoreIfdefDirective"), 1)
  assert.equal(countNodes(scoTree, "ScoreStatementLine"), 2)
})

test("parameterized defines accept formal arguments in parentheses", () => {
  const text = [
    "<CsoundSynthesizer>",
    "<CsInstruments>",
    "#define FRQ2FNUM(xout'xcps'xbsfn) #",
    "$xout = int(($xbsfn) + 0.5 + (100 / 8) * log(($xcps) / 30) / log(2))",
    "$xout limit $xout, $xbsfn, $xbsfn + 99",
    "#",
    "instr 1",
    "endin",
    "</CsInstruments>",
    "<CsScore>",
    "e",
    "</CsScore>",
    "</CsoundSynthesizer>",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "DefineDirective"), 1)
})

test("hash-delimited define bodies parse inline and across continuation lines", () => {
  const text = [
    "<CsoundSynthesizer>",
    "<CsInstruments>",
    "#define FOO #1#",
    "#define FOO2(X) #p3+$X#",
    "#define RANDI(A) #kout randi 1, kfq, $A*.001+iseed, 1",
    "        tablew kout, $A, itable#",
    "instr 1",
    "itable init 1",
    "iseed init .6",
    "kfq line 1, p3, 10",
    "$RANDI(0)",
    "a1 oscil $FOO, 440, 1",
    "a2 oscil 0.5, $FOO2(0.2), 1",
    "endin",
    "</CsInstruments>",
    "<CsScore>",
    "#define SCORELEN # 20 # ; set length of score",
    "i1 0 $SCORELEN",
    "e",
    "</CsScore>",
    "</CsoundSynthesizer>",
    "",
  ].join("\n")
  const tree = parser.configure({ top: "CsdFile" }).parse(text)
  assert.equal(countErrors(tree), 0)
  assert.equal(countNodes(tree, "DefineDirective"), 4)
  assert.equal(countNodes(tree, "HashTerminatedGenericLine"), 1)
})

test("runtime opcode catalog keeps semantic and completion metadata", () => {
  const catalog = JSON.parse(fs.readFileSync(opcodeCatalogPath, "utf8"))
  assert.ok(catalog.count > 1000)
  assert.match(catalog.source, /manual/)
  assert.ok(catalog.manualCount > 1000)
  assert.ok(catalog.z1SignatureOpcodeCount > 1000)
  assert.ok(catalog.signatureCount > catalog.count)

  const opcodes = new Map(catalog.opcodes.map(opcode => [opcode.name, opcode]))
  assert.ok(opcodes.has("oscil"))
  assert.ok(opcodes.has("reverbsc"))
  assert.ok(opcodes.has("chnget"))
  assert.equal(opcodes.has("while"), false)
  assert.equal(opcodes.get("oscili").shortDescription, "A simple oscillator with linear interpolation.")
  assert.equal(opcodes.get("oscili").category, "Signal Generators:Basic Oscillators")
  assert.equal("syntax" in opcodes.get("oscili"), false)
  assert.equal("manualPage" in opcodes.get("oscili"), false)
  assert.ok(opcodes.get("pan2").signatures.some(signature => signature.outTypes === "aa"))
  assert.equal(opcodes.get("pan2").signatureSource, "csound -z1")
  assert.ok(opcodes.get("init").signatures.some(signature => signature.outTypes === "*"))
  assert.equal(catalog.count, catalog.opcodes.length)
})

test("rich opcode catalog preserves manual metadata for optional consumers", () => {
  const catalog = JSON.parse(fs.readFileSync(richOpcodeCatalogPath, "utf8"))
  assert.ok(catalog.count > 1000)
  assert.match(catalog.source, /manual/)
  assert.ok(catalog.manualCount > 1000)
  assert.ok(catalog.signatureCount > catalog.count)

  const opcodes = new Map(catalog.opcodes.map(opcode => [opcode.name, opcode]))
  assert.ok(opcodes.has("oscili"))
  assert.ok(opcodes.get("oscili").syntax.some(line => line.includes("oscili(")))
  assert.equal(opcodes.get("oscili").manualPage, "docs/opcodes/oscili.md")
  assert.equal(opcodes.get("oscili").category, "Signal Generators:Basic Oscillators")
  assert.ok(opcodes.get("pan2").signatures.some(signature => signature.outTypes === "aa"))
  assert.equal(catalog.count, catalog.opcodes.length)
})
