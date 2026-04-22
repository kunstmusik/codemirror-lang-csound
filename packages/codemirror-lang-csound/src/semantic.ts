import { syntaxTree } from "@codemirror/language"
import { RangeSetBuilder, type Extension } from "@codemirror/state"
import type { SyntaxNode } from "@lezer/common"
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view"

import {
  builtInOpcodeNames,
  builtInOpcodeSignatures,
  collectUserOpcodeSignatures,
  type OpcodeSignature,
} from "./opcodes.js"
import { parser } from "./parser.js"

interface TokenSpan {
  from: number
  to: number
  value: string
  baseName: string
}

export type SemanticSpanKind =
  | "builtInOpcode"
  | "userOpcode"
  | "output"
  | "input"
  | "pField"
  | "instrumentName"
export type OpcodeSemanticKind = "builtInOpcode" | "userOpcode"

export interface CsoundSemanticKindOptions {
  documentText?: string
  userOpcodeSignatures?: Map<string, OpcodeSignature[]>
}

export interface AnalyzeCsoundSemanticLineOptions extends CsoundSemanticKindOptions {
  offset?: number
}

export interface SemanticSpan {
  from: number
  to: number
  kind: SemanticSpanKind
}

interface OutputSemanticSpan extends SemanticSpan {
  kind: "output" | "pField"
  rate: string | null
}

interface ClassifiedStatement {
  opcode: TokenSpan
  outputSpans: OutputSemanticSpan[]
  inputSpans: SemanticSpan[]
}

interface FunctionOpcodeCall {
  opcode: TokenSpan
  inputSpans: SemanticSpan[]
}

interface AssignmentOpcodeCall {
  outputSpans: OutputSemanticSpan[]
  opcodeTokens: TokenSpan[]
  inputSpans: SemanticSpan[]
}

interface OutputTargetSemantics {
  outputSpans: OutputSemanticSpan[]
  inputSpans: SemanticSpan[]
}

interface SemanticDocumentContext {
  documentText: string
  userOpcodeSignatures: Map<string, OpcodeSignature[]>
}

interface SemanticDocumentSignatureCache {
  documentText: string
  userOpcodeSignatures: Map<string, OpcodeSignature[]>
}

interface SemanticDocumentParseCache {
  documentText: string
  topRule: "CsdFile" | "OrchestraFile"
  tree: any
}

interface SemanticLineAnalysisCache {
  documentText: string
  text: string
  offset: number
  userOpcodeSignatures: Map<string, OpcodeSignature[]>
  spans: SemanticSpan[]
}

interface SemanticDocumentRangeAnalysisCache {
  documentText: string
  from: number
  to: number
  userOpcodeSignatures: Map<string, OpcodeSignature[]>
  spans: SemanticSpan[]
}

const ambiguousStatementOpcodes = new Set(["a", "b", "B", "i", "k", "p", "S"])
const controlFlowConditionLeadingKeywords = new Set(["if", "elseif", "while", "until"])
const ifConditionTrailingKeywords = ["rigoto", "reinit", "igoto", "kgoto", "ithen", "kthen", "goto", "then"]
const loopConditionTrailingKeywords = ["do"]
const documentBackedSemanticNodeNames = new Set([
  "OrcGenericLine",
  "AssignmentStatement",
  "ReturnStatement",
  "XoutStatement",
])
const documentBackedGroupScanLimit = 64_000
const ignoredSemanticVariableNames = new Set([
  "if",
  "then",
  "ithen",
  "kthen",
  "elseif",
  "else",
  "endif",
  "fi",
  "while",
  "do",
  "od",
  "until",
  "for",
  "in",
  "switch",
  "case",
  "default",
  "endsw",
  "return",
  "rireturn",
  "break",
  "continue",
  "true",
  "false",
])
const identifierPattern = /[A-Za-z_][A-Za-z0-9_]*(?:@global)?(?::[A-Za-z_][A-Za-z0-9_]*(?:\[\])?)?/g

const builtInOpcodeMark = Decoration.mark({
  class: "cm-csoundOpcode cm-csoundBuiltinOpcode",
})
const userOpcodeMark = Decoration.mark({
  class: "cm-csoundOpcode cm-csoundUserOpcode",
})
const opcodeOutputMark = Decoration.mark({
  class: "cm-csoundOpcodeOutput",
})
const opcodeInputMark = Decoration.mark({
  class: "cm-csoundOpcodeInput",
})
const pFieldMark = Decoration.mark({
  class: "cm-csoundPField",
})
const instrumentNameMark = Decoration.mark({
  class: "cm-csoundInstrumentName",
})
const typeAnnotationMark = Decoration.mark({
  class: "cm-csoundTypeAnnotation",
})
const scoreOpcodeTypeMark = Decoration.mark({
  class: "cm-csoundScoreOpcodeType",
})
const scoreNumberMark = Decoration.mark({
  class: "cm-csoundScoreNumber",
})

let semanticDocumentParseCache: SemanticDocumentParseCache | null = null
let semanticDocumentSignatureCache: SemanticDocumentSignatureCache | null = null
let semanticLineAnalysisCache: SemanticLineAnalysisCache | null = null
let semanticDocumentRangeAnalysisCache: SemanticDocumentRangeAnalysisCache | null = null

const semanticTheme = EditorView.baseTheme({
  ".cm-content .cm-csoundBuiltinOpcode, .cm-content .cm-csoundBuiltinOpcode *": {
    color: "#dcdcaa",
  },
  ".cm-content .cm-csoundUserOpcode, .cm-content .cm-csoundUserOpcode *": {
    color: "#4ec9b0",
    fontStyle: "italic",
  },
  ".cm-content .cm-csoundOpcodeOutput, .cm-content .cm-csoundOpcodeOutput *": {
    color: "#9cdcfe",
    fontWeight: "600",
  },
  ".cm-content .cm-csoundOpcodeInput, .cm-content .cm-csoundOpcodeInput *": {
    color: "#9cdcfe",
  },
  ".cm-content .cm-csoundPField, .cm-content .cm-csoundPField *": {
    color: "#d7ba7d",
    fontWeight: "600",
  },
  ".cm-content .cm-csoundInstrumentName, .cm-content .cm-csoundInstrumentName *": {
    color: "#4fc1ff",
    fontWeight: "700",
  },
  ".cm-content .cm-csoundTypeAnnotation, .cm-content .cm-csoundTypeAnnotation *": {
    color: "#c586c0",
    fontStyle: "normal",
    fontWeight: "700",
  },
  ".cm-content .cm-csoundScoreOpcodeType, .cm-content .cm-csoundScoreOpcodeType *": {
    color: "#569cd6",
    fontWeight: "700",
  },
  ".cm-content .cm-csoundScoreNumber, .cm-content .cm-csoundScoreNumber *": {
    color: "#b5cea8",
    fontWeight: "400",
  },
})

export function csoundSemanticHighlighting(): Extension {
  return [semanticTheme, semanticOpcodePlugin]
}

const semanticOpcodePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    documentContext: SemanticDocumentContext

    constructor(view: EditorView) {
      this.documentContext = createSemanticDocumentContext(view.state.doc.toString())
      this.decorations = buildOpcodeDecorations(view, this.documentContext)
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.documentContext = createSemanticDocumentContext(update.state.doc.toString())
      }

      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildOpcodeDecorations(update.view, this.documentContext)
      }
    }
  },
  {
    decorations: plugin => plugin.decorations,
  },
)

function buildOpcodeDecorations(
  view: EditorView,
  documentContext: SemanticDocumentContext,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { documentText, userOpcodeSignatures } = documentContext
  const tree = syntaxTree(view.state)

  for (const viewport of view.visibleRanges) {
    tree.iterate({
      from: viewport.from,
      to: viewport.to,
      enter(node) {
        if (
          node.name === "TypedIdentifier" ||
          node.name === "TypedArrayIdentifier" ||
          node.name === "GlobalTypedIdentifier" ||
          node.name === "GlobalTypedArrayIdentifier"
        ) {
          addTypedIdentifierTypeAnnotation(builder, view, node.from, node.to)
          return
        }

        if (node.name === "PField") {
          builder.add(node.from, node.to, pFieldMark)
          return false
        }

        if (node.name === "InstrId") {
          const text = view.state.doc.sliceString(node.from, node.to)
          if (isNamedInstrumentName(text)) builder.add(node.from, node.to, instrumentNameMark)
          return
        }

        if (node.name === "LegacyUdo" || node.name === "ModernUdo") {
          const text = view.state.doc.sliceString(node.from, node.to)
          const range = udoDefinitionNameRange(text, node.from)
          if (range) builder.add(range.from, range.to, userOpcodeMark)
        }

        if (node.name === "UdoReturnSpec") {
          addUdoReturnSpecTypeAnnotation(builder, view, node.from, node.to)
          return
        }

        if (node.name === "ScoreOpcode") {
          const text = view.state.doc.sliceString(node.from, node.to)
          const eventRange = scoreOpcodeEventTypeRange(node.from, node.to)
          const pfieldRange = scoreOpcodePFieldNumberRange(text, node.from)
          if (eventRange) builder.add(eventRange.from, eventRange.to, scoreOpcodeTypeMark)
          if (pfieldRange) builder.add(pfieldRange.from, pfieldRange.to, scoreNumberMark)
          return false
        }

        if (node.name === "MacroUsageToken") {
          const text = view.state.doc.sliceString(node.from, node.to)
          for (const range of macroArgumentNumberRanges(text, node.from)) {
            builder.add(range.from, range.to, scoreNumberMark)
          }
          return false
        }

        if (node.name === "XoutStatement") {
          const text = view.state.doc.sliceString(node.from, node.to)
          const decorations: Array<{ from: number; to: number; mark: Decoration }> = []
          for (const span of findSemanticSpans(text, node.from, userOpcodeSignatures)) {
            decorations.push({
              from: span.from,
              to: span.to,
              mark: markForSemanticSpan(span),
            })
          }

          for (const { from, to, mark } of decorations) {
            builder.add(from, to, mark)
          }

          return false
        }

        if (node.name === "ReturnStatement") {
          const text = view.state.doc.sliceString(node.from, node.to)
          const semanticSpans = findReturnSemanticSpans(text, node.from, userOpcodeSignatures) ?? []
          for (const span of semanticSpans) {
            builder.add(span.from, span.to, markForSemanticSpan(span))
          }

          return false
        }

        if (node.name === "FunctionCallStatement") {
          const text = view.state.doc.sliceString(node.from, node.to)
          const semanticSpans = findSemanticSpans(text, node.from, userOpcodeSignatures)
          for (const span of semanticSpans) {
            builder.add(span.from, span.to, markForSemanticSpan(span))
          }

          return false
        }

        if (node.name === "AssignmentStatement") {
          const text = view.state.doc.sliceString(node.from, node.to)
          const semanticSpans = findSemanticSpans(text, node.from, userOpcodeSignatures)
          if (semanticSpans.length === 0) return

          const decorations: Array<{ from: number; to: number; mark: Decoration }> = []
          for (const span of semanticSpans) {
            decorations.push({
              from: span.from,
              to: span.to,
              mark: markForSemanticSpan(span),
            })
          }
          for (const span of findTypeAnnotationSpans(text, node.from)) {
            decorations.push({
              from: span.from,
              to: span.to,
              mark: typeAnnotationMark,
            })
          }
          decorations.sort((a, b) => a.from - b.from || a.to - b.to)

          for (const { from, to, mark } of decorations) {
            builder.add(from, to, mark)
          }

          return false
        }

        if (node.name === "OrcExpr") {
          if (!isControlFlowConditionExpression(documentText, node.from, node.to)) return

          const text = view.state.doc.sliceString(node.from, node.to)
          const semanticSpans = findConditionExpressionSemanticSpans(text, node.from, userOpcodeSignatures)
          for (const span of semanticSpans) {
            builder.add(span.from, span.to, markForSemanticSpan(span))
          }

          return false
        }

        if (node.name === "UdoArgTypes") {
          builder.add(node.from, node.to, typeAnnotationMark)
          return false
        }

        if (node.name === "FunctionCallee" || node.name === "ScoreFunctionCallee") {
          const text = view.state.doc.sliceString(node.from, node.to)
          const kind = getCsoundSemanticKind(text, { userOpcodeSignatures })
          if (kind) {
            builder.add(node.from, node.to, markForSemanticSpan({ from: node.from, to: node.to, kind }))
          }
          return
        }

        if (node.name !== "OrcGenericLine") return

        const text = view.state.doc.sliceString(node.from, node.to)
        const decorations: Array<{ from: number; to: number; mark: Decoration }> = []
        for (const span of findSemanticSpans(text, node.from, userOpcodeSignatures)) {
          decorations.push({
            from: span.from,
            to: span.to,
            mark: markForSemanticSpan(span),
          })
        }
        for (const span of findTypeAnnotationSpans(text, node.from)) {
          decorations.push({
            from: span.from,
            to: span.to,
            mark: typeAnnotationMark,
          })
        }
        decorations.sort((a, b) => a.from - b.from || a.to - b.to)

        for (const { from, to, mark } of decorations) {
          builder.add(from, to, mark)
        }

        return false
      },
    })
  }

  return builder.finish()
}

function createSemanticDocumentContext(documentText: string): SemanticDocumentContext {
  return {
    documentText,
    userOpcodeSignatures: getDocumentUserOpcodeSignatures(documentText),
  }
}

function addTypedIdentifierTypeAnnotation(
  builder: RangeSetBuilder<Decoration>,
  view: EditorView,
  from: number,
  to: number,
): void {
  const text = view.state.doc.sliceString(from, to)
  const colonIndex = text.indexOf(":")
  if (colonIndex === -1) return
  builder.add(from + colonIndex, to, typeAnnotationMark)
}

function addUdoReturnSpecTypeAnnotation(
  builder: RangeSetBuilder<Decoration>,
  view: EditorView,
  from: number,
  to: number,
): void {
  const colonPosition = previousNonSpacePosition(view, from - 1)
  if (colonPosition === null) return
  if (view.state.doc.sliceString(colonPosition, colonPosition + 1) !== ":") return
  builder.add(colonPosition, to, typeAnnotationMark)
}

export function scoreOpcodeEventTypeRange(
  from: number,
  to: number,
): { from: number; to: number } | null {
  if (to <= from) return null
  return { from, to: Math.min(from + 1, to) }
}

export function scoreOpcodePFieldNumberRange(
  text: string,
  offset = 0,
): { from: number; to: number } | null {
  if (!/^[A-Za-z]\d+$/.test(text)) return null
  return { from: offset + 1, to: offset + text.length }
}

export function macroArgumentNumberRanges(
  text: string,
  offset = 0,
): Array<{ from: number; to: number }> {
  const argsStart = text.indexOf("(")
  const argsEnd = text.lastIndexOf(")")
  if (argsStart === -1 || argsEnd <= argsStart) return []

  const ranges: Array<{ from: number; to: number }> = []
  const args = text.slice(argsStart + 1, argsEnd)
  const numberPattern =
    /0[xX][0-9a-fA-F]+|(?:[0-9]+\.[0-9]+|\.[0-9]+)(?:[eE][+\-]?[0-9]+)?|[0-9]+(?:[eE][+\-]?[0-9]+)?/g

  for (const match of args.matchAll(numberPattern)) {
    const from = offset + argsStart + 1 + (match.index ?? 0)
    ranges.push({ from, to: from + match[0].length })
  }

  return ranges
}

function markForSemanticSpan(span: SemanticSpan): Decoration {
  if (span.kind === "builtInOpcode") return builtInOpcodeMark
  if (span.kind === "userOpcode") return userOpcodeMark
  if (span.kind === "output") return opcodeOutputMark
  if (span.kind === "pField") return pFieldMark
  if (span.kind === "instrumentName") return instrumentNameMark
  return opcodeInputMark
}

export function findSemanticSpans(
  text: string,
  offset: number,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] {
  const code = maskNonCodeText(text)
  const xoutPrefix = code.match(/^xout\b\s*/)
  if (xoutPrefix) {
    return findXoutSemanticSpans(code, offset, xoutPrefix[0].length, userOpcodeSignatures)
  }

  const xinSpans = findXinSemanticSpans(code, offset)
  if (xinSpans.length > 0) return xinSpans

  const definitionSpans = findDefinitionSemanticSpans(code, offset)
  if (definitionSpans.length > 0) return definitionSpans

  const returnSpans = findReturnSemanticSpans(code, offset, userOpcodeSignatures)
  if (returnSpans) return returnSpans

  const controlFlowConditionSpans = findControlFlowConditionSemanticSpans(code, offset, userOpcodeSignatures)
  if (controlFlowConditionSpans.length > 0) return controlFlowConditionSpans

  const tokens = collectIdentifierTokens(code, offset)
  const assignmentPosition = findAssignmentPosition(code)
  const consumedOpcodeTokens = new Set<string>()
  const result: SemanticSpan[] = []
  const statementOpcodes = findStatementOpcodes(code, tokens, userOpcodeSignatures, assignmentPosition, offset)
  const assignmentOpcodeCall = findAssignmentOpcodeCall(
    code,
    tokens,
    userOpcodeSignatures,
    assignmentPosition,
    offset,
  )

  for (const statement of statementOpcodes) {
    consumedOpcodeTokens.add(spanKey(statement.opcode))
    const kind = getCsoundSemanticKind(statement.opcode.baseName, { userOpcodeSignatures })
    if (!kind) continue
    appendSemanticSpans(result, statement.outputSpans)
    result.push({
      from: statement.opcode.from,
      to: statement.opcode.to,
      kind,
    })
    appendSemanticSpans(result, statement.inputSpans)
  }

  if (assignmentOpcodeCall) {
    appendSemanticSpans(result, assignmentOpcodeCall.outputSpans)

    for (const token of assignmentOpcodeCall.opcodeTokens) {
      consumedOpcodeTokens.add(spanKey(token))
      const kind = getCsoundSemanticKind(token.baseName, { userOpcodeSignatures })
      if (kind) {
        result.push({
          from: token.from,
          to: token.to,
          kind,
        })
      }
    }

    appendSemanticSpans(result, assignmentOpcodeCall.inputSpans)
  }

  if (statementOpcodes.length === 0 && !assignmentOpcodeCall) {
    const functionOpcodeCall = findLeadingFunctionOpcodeCall(
      code,
      tokens,
      userOpcodeSignatures,
      assignmentPosition,
      offset,
    )

    if (functionOpcodeCall) {
      consumedOpcodeTokens.add(spanKey(functionOpcodeCall.opcode))
      const kind = getCsoundSemanticKind(functionOpcodeCall.opcode.baseName, { userOpcodeSignatures })
      if (kind) {
        result.push({
          from: functionOpcodeCall.opcode.from,
          to: functionOpcodeCall.opcode.to,
          kind,
        })
        appendSemanticSpans(result, functionOpcodeCall.inputSpans)
      }
    }
  }

  if (statementOpcodes.length === 0 && !assignmentOpcodeCall) {
    appendSemanticSpans(result, findPlainAssignmentSemanticSpans(code, offset, assignmentPosition))
  }

  for (const token of findFunctionOpcodeTokens(code, tokens, userOpcodeSignatures, assignmentPosition, offset)) {
    if (consumedOpcodeTokens.has(spanKey(token))) continue
    const kind = getCsoundSemanticKind(token.baseName, { userOpcodeSignatures })
    if (!kind) continue
    result.push({
      from: token.from,
      to: token.to,
      kind,
    })
  }

  return result.sort((a, b) => a.from - b.from || a.to - b.to)
}

export function analyzeCsoundSemanticLine(
  text: string,
  options?: AnalyzeCsoundSemanticLineOptions,
): SemanticSpan[] {
  const userOpcodeSignatures =
    options?.userOpcodeSignatures ??
    (options?.documentText
      ? getDocumentUserOpcodeSignatures(options.documentText)
      : collectUserOpcodeSignatures(text))
  const offset = options?.offset ?? 0

  if (options?.documentText && options.offset !== undefined) {
    const cachedAnalysis = semanticLineAnalysisCache
    if (
      cachedAnalysis &&
      cachedAnalysis.documentText === options.documentText &&
      cachedAnalysis.text === text &&
      cachedAnalysis.offset === offset &&
      cachedAnalysis.userOpcodeSignatures === userOpcodeSignatures
    ) {
      return cachedAnalysis.spans
    }
  }

  const semanticSpans = findSemanticSpans(text, offset, userOpcodeSignatures)
  if (semanticSpans.length > 0 || options?.offset === undefined || !options.documentText) {
    if (options?.documentText && options.offset !== undefined) {
      semanticLineAnalysisCache = {
        documentText: options.documentText,
        text,
        offset,
        userOpcodeSignatures,
        spans: semanticSpans,
      }
    }

    return semanticSpans
  }

  const documentBackedSpans = findDocumentBackedLineSemanticSpans(
    text,
    offset,
    options.documentText,
    userOpcodeSignatures,
  )
  const finalSpans = documentBackedSpans.length > 0 ? documentBackedSpans : semanticSpans
  semanticLineAnalysisCache = {
    documentText: options.documentText,
    text,
    offset,
    userOpcodeSignatures,
    spans: finalSpans,
  }
  return finalSpans
}

export function getCsoundSemanticKind(
  name: string,
  options?: CsoundSemanticKindOptions,
): OpcodeSemanticKind | null {
  const baseName = baseIdentifierName(name)
  const userOpcodeSignatures =
    options?.userOpcodeSignatures ??
    (options?.documentText ? getDocumentUserOpcodeSignatures(options.documentText) : undefined)

  if (userOpcodeSignatures?.has(baseName)) return "userOpcode"
  return builtInOpcodeNames.has(baseName) ? "builtInOpcode" : null
}

function findTypeAnnotationSpans(text: string, offset: number): SemanticSpan[] {
  const code = maskNonCodeText(text)
  const spans: SemanticSpan[] = []

  for (const match of code.matchAll(/[A-Za-z_][A-Za-z0-9_]*(?:@global)?(:[A-Za-z_][A-Za-z0-9_]*(?:\[\])?)/g)) {
    const matchIndex = match.index ?? 0
    const colonIndex = match[0].indexOf(":")
    spans.push({
      from: offset + matchIndex + colonIndex,
      to: offset + matchIndex + match[0].length,
      kind: "input",
    })
  }

  return spans
}

function findDefinitionSemanticSpans(code: string, offset: number): SemanticSpan[] {
  const udoName = udoDefinitionNameRange(code, offset)
  if (udoName) return [{ from: udoName.from, to: udoName.to, kind: "userOpcode" }]

  const instrPrefix = code.match(/^instr\b/)
  if (!instrPrefix) return []

  const spans: SemanticSpan[] = []
  const instrIdText = code.slice(instrPrefix[0].length)
  const namePattern = /[A-Za-z_][A-Za-z0-9_]*/g
  for (const match of instrIdText.matchAll(namePattern)) {
    const value = match[0]
    if (!isNamedInstrumentName(value)) continue
    const from = offset + instrPrefix[0].length + (match.index ?? 0)
    spans.push({ from, to: from + value.length, kind: "instrumentName" })
  }
  return spans
}

function findXoutSemanticSpans(
  code: string,
  offset: number,
  payloadStart: number,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] {
  const payload = code.slice(payloadStart)
  const payloadOffset = offset + payloadStart

  const spans: SemanticSpan[] = []
  appendSemanticSpans(spans, findSemanticSpans(payload, payloadOffset, userOpcodeSignatures))
  appendSemanticSpans(
    spans,
    collectStandaloneIdentifierListSpans(payload, payloadOffset, outputSemanticKindForVariable),
  )
  return spans.sort((a, b) => a.from - b.from || a.to - b.to)
}

function findReturnSemanticSpans(
  code: string,
  offset: number,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] | null {
  const keywordMatch = code.match(/^\s*(return|rireturn)\b\s*/)
  if (!keywordMatch) return null

  if (keywordMatch[1] === "rireturn") return []

  const payloadStart = keywordMatch[0].length
  const payload = code.slice(payloadStart)
  if (!payload.trim()) return []

  return findConditionExpressionSemanticSpans(payload, offset + payloadStart, userOpcodeSignatures)
}

function appendSemanticSpans(target: SemanticSpan[], spans: readonly SemanticSpan[]): void {
  for (const span of spans) {
    target.push(span)
  }
}

function findXinSemanticSpans(code: string, offset: number): SemanticSpan[] {
  const xinMatch = code.match(/\bxin\s*$/)
  if (!xinMatch || xinMatch.index === undefined) return []

  return collectStandaloneIdentifierListSpans(
    code.slice(0, xinMatch.index),
    offset,
    outputSemanticKindForVariable,
  )
}

function udoDefinitionNameRange(text: string, offset = 0): { from: number; to: number } | null {
  const match = text.match(/^opcode\b\s*([A-Za-z_][A-Za-z0-9_]*)/)
  if (!match || match.index === undefined) return null
  const nameStart = match[0].lastIndexOf(match[1])
  const from = offset + nameStart
  return { from, to: from + match[1].length }
}

function findDocumentBackedLineSemanticSpans(
  text: string,
  offset: number,
  documentText: string,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] {
  const lineTo = offset + text.length
  if (documentText.slice(offset, lineTo) !== text) return []

  const cachedRangeSpans = filterCachedDocumentRangeSemanticSpans(
    documentText,
    offset,
    lineTo,
    userOpcodeSignatures,
  )
  if (cachedRangeSpans) return cachedRangeSpans

  const groupedSpans = findGroupedDocumentBackedLineSemanticSpans(
    offset,
    lineTo,
    documentText,
    userOpcodeSignatures,
  )
  if (groupedSpans) return groupedSpans

  const windowedSpans = findWindowedDocumentBackedLineSemanticSpans(
    offset,
    lineTo,
    documentText,
    userOpcodeSignatures,
  )
  if (windowedSpans) return windowedSpans

  const node = findEnclosingDocumentBackedSemanticNode(documentText, offset, lineTo)
  if (!node) return []

  const nodeText = documentText.slice(node.from, node.to)
  const semanticSpans = semanticSpansForParsedNode(node.name, nodeText, node.from, userOpcodeSignatures)
  return semanticSpans.filter(span => span.from < lineTo && span.to > offset)
}

function filterCachedDocumentRangeSemanticSpans(
  documentText: string,
  offset: number,
  lineTo: number,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] | null {
  const cachedRange = semanticDocumentRangeAnalysisCache
  if (
    !cachedRange ||
    cachedRange.documentText !== documentText ||
    cachedRange.userOpcodeSignatures !== userOpcodeSignatures ||
    cachedRange.from > offset ||
    cachedRange.to < lineTo
  ) {
    return null
  }

  const spans = filterLineSemanticSpans(cachedRange.spans, offset, lineTo)
  return spans.length > 0 ? spans : null
}

function findGroupedDocumentBackedLineSemanticSpans(
  offset: number,
  lineTo: number,
  documentText: string,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] | null {
  const groupStart = findEnclosingOpenGroupStart(documentText, offset)
  if (groupStart === null) return null

  const groupEnd = findMatchingGroupEnd(documentText, groupStart)
  if (groupEnd === null || groupEnd < lineTo) return null

  const from = lineStartBefore(documentText, groupStart)
  const to = lineEndAfter(documentText, groupEnd)
  const semanticSpans = analyzeDocumentRangeSemanticSpans(documentText, from, to, userOpcodeSignatures)
  const spans = filterLineSemanticSpans(semanticSpans, offset, lineTo)
  return spans.length > 0 ? spans : null
}

function findWindowedDocumentBackedLineSemanticSpans(
  offset: number,
  lineTo: number,
  documentText: string,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] | null {
  for (const windowRadius of [1, 2, 4, 8, 16]) {
    const window = expandDocumentLineWindow(documentText, offset, lineTo, windowRadius, windowRadius)
    if (window.from === offset && window.to === lineTo) continue

    const semanticSpans = analyzeDocumentRangeSemanticSpans(
      documentText,
      window.from,
      window.to,
      userOpcodeSignatures,
    )
    const spans = filterLineSemanticSpans(semanticSpans, offset, lineTo)
    if (spans.length > 0) return spans
  }

  return null
}

function analyzeDocumentRangeSemanticSpans(
  documentText: string,
  from: number,
  to: number,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] {
  const cachedRange = semanticDocumentRangeAnalysisCache
  if (
    cachedRange &&
    cachedRange.documentText === documentText &&
    cachedRange.userOpcodeSignatures === userOpcodeSignatures &&
    cachedRange.from === from &&
    cachedRange.to === to
  ) {
    return cachedRange.spans
  }

  const spans = findSemanticSpans(documentText.slice(from, to), from, userOpcodeSignatures)
  semanticDocumentRangeAnalysisCache = {
    documentText,
    from,
    to,
    userOpcodeSignatures,
    spans,
  }
  return spans
}

function filterLineSemanticSpans(
  spans: readonly SemanticSpan[],
  offset: number,
  lineTo: number,
): SemanticSpan[] {
  return spans.filter(span => span.from < lineTo && span.to > offset)
}

function findEnclosingOpenGroupStart(documentText: string, offset: number): number | null {
  const from = Math.max(0, offset - documentBackedGroupScanLimit)
  const text = maskNonCodeText(documentText.slice(from, offset))
  const stack: Array<{ char: string; index: number }> = []

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === "(" || char === "[" || char === "{") {
      stack.push({ char, index: from + index })
      continue
    }

    const opener = matchingOpenGroupChar(char)
    if (opener && stack[stack.length - 1]?.char === opener) {
      stack.pop()
    }
  }

  return stack[0]?.index ?? null
}

function findMatchingGroupEnd(documentText: string, groupStart: number): number | null {
  const opener = documentText[groupStart]
  const closer = matchingCloseGroupChar(opener)
  if (!closer) return null

  const to = Math.min(documentText.length, groupStart + documentBackedGroupScanLimit)
  const text = maskNonCodeText(documentText.slice(groupStart, to))
  let depth = 0

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === opener) depth += 1
    if (char === closer) depth -= 1
    if (depth === 0) return groupStart + index + 1
  }

  return null
}

function matchingOpenGroupChar(char: string): string | null {
  if (char === ")") return "("
  if (char === "]") return "["
  if (char === "}") return "{"
  return null
}

function matchingCloseGroupChar(char: string): string | null {
  if (char === "(") return ")"
  if (char === "[") return "]"
  if (char === "{") return "}"
  return null
}

function lineStartBefore(text: string, position: number): number {
  const previousBreak = text.lastIndexOf("\n", Math.max(0, position - 1))
  return previousBreak === -1 ? 0 : previousBreak + 1
}

function lineEndAfter(text: string, position: number): number {
  const nextBreak = text.indexOf("\n", position)
  return nextBreak === -1 ? text.length : nextBreak
}

function findEnclosingDocumentBackedSemanticNode(
  documentText: string,
  from: number,
  to: number,
): { name: string; from: number; to: number } | null {
  const tree = parseSemanticDocumentTree(documentText)
  let node: SyntaxNode | null = tree.resolveInner(from, 1)

  while (node) {
    if (
      documentBackedSemanticNodeNames.has(node.name) &&
      node.from <= from &&
      node.to >= to &&
      !(node.from === from && node.to === to)
    ) {
      return { name: node.name, from: node.from, to: node.to }
    }

    node = node.parent
  }

  return null
}

function expandDocumentLineWindow(
  documentText: string,
  from: number,
  to: number,
  beforeLineCount: number,
  afterLineCount: number,
): { from: number; to: number } {
  let windowFrom = from
  for (let index = 0; index < beforeLineCount && windowFrom > 0; index += 1) {
    const previousBreak = documentText.lastIndexOf("\n", Math.max(0, windowFrom - 2))
    windowFrom = previousBreak === -1 ? 0 : previousBreak + 1
  }

  let windowTo = to
  for (let index = 0; index < afterLineCount && windowTo < documentText.length; index += 1) {
    const nextBreak = documentText.indexOf("\n", windowTo)
    if (nextBreak === -1) {
      windowTo = documentText.length
      break
    }

    windowTo = nextBreak + 1
  }

  return { from: windowFrom, to: windowTo }
}

function parseSemanticDocumentTree(documentText: string): any {
  const topRule = semanticParseTopRule(documentText)
  const cachedParse = semanticDocumentParseCache
  if (cachedParse && cachedParse.documentText === documentText && cachedParse.topRule === topRule) {
    return cachedParse.tree
  }

  const tree = parser.configure({ top: topRule }).parse(documentText)
  semanticDocumentParseCache = {
    documentText,
    topRule,
    tree,
  }
  return tree
}

function getDocumentUserOpcodeSignatures(documentText: string): Map<string, OpcodeSignature[]> {
  const cachedSignatures = semanticDocumentSignatureCache
  if (cachedSignatures && cachedSignatures.documentText === documentText) {
    return cachedSignatures.userOpcodeSignatures
  }

  const userOpcodeSignatures = collectUserOpcodeSignatures(documentText)
  semanticDocumentSignatureCache = {
    documentText,
    userOpcodeSignatures,
  }
  return userOpcodeSignatures
}

function semanticParseTopRule(documentText: string): "CsdFile" | "OrchestraFile" {
  return /<CsoundSynthesizer\b/i.test(documentText) ? "CsdFile" : "OrchestraFile"
}

function semanticSpansForParsedNode(
  nodeName: string,
  text: string,
  offset: number,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] {
  if (nodeName === "ReturnStatement") {
    return findReturnSemanticSpans(text, offset, userOpcodeSignatures) ?? []
  }

  return findSemanticSpans(text, offset, userOpcodeSignatures)
}

function findControlFlowConditionSemanticSpans(
  code: string,
  offset: number,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] {
  const range = findControlFlowConditionRange(code)
  if (!range) return []
  return findConditionExpressionSemanticSpans(
    code.slice(range.from, range.to),
    offset + range.from,
    userOpcodeSignatures,
  )
}

function findConditionExpressionSemanticSpans(
  code: string,
  offset: number,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] {
  const tokens = collectIdentifierTokens(code, offset).filter(
    token => !ignoredSemanticVariableNames.has(token.baseName),
  )
  if (tokens.length === 0) return []

  const consumedOpcodeTokens = new Set<string>()
  const spans: SemanticSpan[] = []

  for (const token of findFunctionOpcodeTokens(code, tokens, userOpcodeSignatures, -1, offset)) {
    consumedOpcodeTokens.add(spanKey(token))
    const kind = getCsoundSemanticKind(token.baseName, { userOpcodeSignatures })
    if (!kind) continue
    spans.push({
      from: token.from,
      to: token.to,
      kind,
    })
  }

  for (const token of tokens) {
    if (consumedOpcodeTokens.has(spanKey(token))) continue
    spans.push({
      from: token.from,
      to: token.to,
      kind: inputSemanticKindForVariable(token.value),
    })
  }

  return spans.sort((a, b) => a.from - b.from || a.to - b.to)
}

function findControlFlowConditionRange(code: string): { from: number; to: number } | null {
  const leadingKeywordMatch = code.match(/^\s*(if|elseif|while|until)\b/)
  const leadingKeyword = leadingKeywordMatch?.[1]
  if (!leadingKeyword) return null

  const from = nextNonSpacePosition(code, leadingKeywordMatch[0].length)
  if (from === null) return null

  const trailingKeywords =
    leadingKeyword === "while" || leadingKeyword === "until"
      ? loopConditionTrailingKeywords
      : ifConditionTrailingKeywords
  const to = findTopLevelKeywordPosition(code, from, trailingKeywords)
  if (to === null) return null

  return trimSpan(code, from, to)
}

function findTopLevelKeywordPosition(text: string, start: number, keywords: readonly string[]): number | null {
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (char === "(") parenDepth += 1
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1)
    if (char === "[") bracketDepth += 1
    if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1)
    if (char === "{") braceDepth += 1
    if (char === "}") braceDepth = Math.max(0, braceDepth - 1)

    if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0) continue

    for (const keyword of keywords) {
      if (matchesKeywordAt(text, index, keyword)) return index
    }
  }

  return null
}

function matchesKeywordAt(text: string, index: number, keyword: string): boolean {
  if (!text.startsWith(keyword, index)) return false
  return isKeywordBoundary(text[index - 1]) && isKeywordBoundary(text[index + keyword.length])
}

function isKeywordBoundary(char: string | undefined): boolean {
  return char === undefined || !/[A-Za-z0-9_]/.test(char)
}

function isControlFlowConditionExpression(documentText: string, from: number, to: number): boolean {
  const previousKeyword = readPreviousWord(documentText, from - 1)
  if (!previousKeyword || !controlFlowConditionLeadingKeywords.has(previousKeyword)) return false

  const nextKeyword = readNextWord(documentText, to)
  if (!nextKeyword) return false

  if (previousKeyword === "while" || previousKeyword === "until") {
    return loopConditionTrailingKeywords.includes(nextKeyword)
  }

  return ifConditionTrailingKeywords.includes(nextKeyword)
}

function readPreviousWord(text: string, start: number): string | null {
  const end = previousNonSpacePositionInText(text, start)
  if (end === null || !/[A-Za-z]/.test(text[end])) return null

  let from = end
  while (from > 0 && /[A-Za-z]/.test(text[from - 1])) from -= 1
  return text.slice(from, end + 1)
}

function readNextWord(text: string, start: number): string | null {
  const from = nextNonSpacePosition(text, start)
  if (from === null || !/[A-Za-z]/.test(text[from])) return null

  let to = from + 1
  while (to < text.length && /[A-Za-z]/.test(text[to])) to += 1
  return text.slice(from, to)
}

function findFunctionOpcodeTokens(
  code: string,
  tokens: TokenSpan[],
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
  assignmentPosition: number,
  offset: number,
  options?: {
    includeAfterAssignment?: boolean
    minLocalFrom?: number
  },
): TokenSpan[] {
  const marked = new Set<string>()
  const result: TokenSpan[] = []

  for (const token of tokens) {
    if (!isKnownOpcode(token.baseName, userOpcodeSignatures)) continue
    if (token.from - offset < (options?.minLocalFrom ?? 0)) continue

    const localTo = token.to - offset
    const nextChar = nextNonSpaceChar(code, localTo)
    if (nextChar === "[") continue
    const isFunctionCall = nextChar === "("
    const isBeforeAssignment = assignmentPosition === -1 || token.from - offset < assignmentPosition

    if (!isFunctionCall || (!options?.includeAfterAssignment && !isBeforeAssignment)) continue

    const key = spanKey(token)
    if (marked.has(key)) continue
    marked.add(key)
    result.push(token)
  }

  return result
}

function findAssignmentOpcodeCall(
  code: string,
  tokens: TokenSpan[],
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
  assignmentPosition: number,
  offset: number,
): AssignmentOpcodeCall | null {
  if (assignmentPosition === -1) return null

  const targetSemantics = collectOutputTargetSemantics(code, offset, assignmentPosition)
  if (!targetSemantics || targetSemantics.outputSpans.length === 0) return null

  const opcodeTokens = findFunctionOpcodeTokens(code, tokens, userOpcodeSignatures, assignmentPosition, offset, {
    includeAfterAssignment: true,
    minLocalFrom: assignmentPosition + 1,
  })
  if (opcodeTokens.length === 0) return null

  return {
    outputSpans: targetSemantics.outputSpans,
    opcodeTokens,
    inputSpans: [
      ...targetSemantics.inputSpans,
      ...collectAssignmentInputSpans(code, tokens, assignmentPosition, offset, userOpcodeSignatures),
    ],
  }
}

function findStatementOpcodes(
  code: string,
  tokens: TokenSpan[],
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
  assignmentPosition: number,
  offset: number,
): ClassifiedStatement[] {
  const statements: ClassifiedStatement[] = []

  if (assignmentPosition !== -1) return statements

  for (const token of tokens) {
    if (!isKnownOpcode(token.baseName, userOpcodeSignatures)) continue
    if (ambiguousStatementOpcodes.has(token.baseName)) continue

    const localFrom = token.from - offset
    const localTo = token.to - offset
    const nextChar = nextNonSpaceChar(code, localTo)
    if (nextChar === "[") continue

    const targetSemantics = collectOutputTargetSemantics(code, offset, localFrom)
    if (!targetSemantics) continue

    if ((nextChar === "(" && targetSemantics.outputSpans.length === 0) || startsAssignmentOperator(code, localTo)) {
      continue
    }

    const signatures = getOpcodeSignatures(token.baseName, userOpcodeSignatures)
    if (!signatureAllowsOutputs(signatures, targetSemantics.outputSpans)) continue

    statements.push({
      opcode: token,
      outputSpans: targetSemantics.outputSpans,
      inputSpans: [...targetSemantics.inputSpans, ...collectInputSpans(code, tokens, token.to, offset, userOpcodeSignatures)],
    })
    break
  }

  return statements
}

function findLeadingFunctionOpcodeCall(
  code: string,
  tokens: TokenSpan[],
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
  assignmentPosition: number,
  offset: number,
): FunctionOpcodeCall | null {
  for (const token of tokens) {
    if (!isKnownOpcode(token.baseName, userOpcodeSignatures)) continue

    const localTo = token.to - offset
    const nextChar = nextNonSpaceChar(code, localTo)
    const isBeforeAssignment = assignmentPosition === -1 || token.from - offset < assignmentPosition
    if (nextChar !== "(" || !isBeforeAssignment) continue

    return {
      opcode: token,
      inputSpans: collectInputSpans(code, tokens, token.to, offset, userOpcodeSignatures),
    }
  }

  return null
}

function collectIdentifierTokens(code: string, offset: number): TokenSpan[] {
  const tokens: TokenSpan[] = []
  for (const match of code.matchAll(identifierPattern)) {
    const matchIndex = match.index ?? 0
    if (matchIndex > 0 && code[matchIndex - 1] === ".") continue

    const value = match[0]
    const from = offset + matchIndex
    tokens.push({
      from,
      to: from + value.length,
      value,
      baseName: baseIdentifierName(value),
    })
  }
  return tokens
}

function collectStandaloneIdentifierListSpans(
  code: string,
  offset: number,
  kindForVariable: (name: string) => "output" | "pField" | "input",
): SemanticSpan[] {
  return splitTopLevelCommaSegments(code)
    .map(segment => trimSpan(code, segment.from, segment.to))
    .filter((segment): segment is { from: number; to: number } => segment !== null)
    .filter(segment => isStandaloneIdentifierSegment(code.slice(segment.from, segment.to)))
    .map(segment => {
      const value = code.slice(segment.from, segment.to)
      return {
        from: offset + segment.from,
        to: offset + segment.to,
        kind: kindForVariable(value),
      }
    })
}

function splitTopLevelCommaSegments(code: string): Array<{ from: number; to: number }> {
  const segments: Array<{ from: number; to: number }> = []
  let segmentStart = 0
  let parenDepth = 0
  let bracketDepth = 0
  let braceDepth = 0

  for (let index = 0; index <= code.length; index += 1) {
    const char = code[index]

    if (char === "(") parenDepth += 1
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1)
    if (char === "[") bracketDepth += 1
    if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1)
    if (char === "{") braceDepth += 1
    if (char === "}") braceDepth = Math.max(0, braceDepth - 1)

    if (
      (char === "," && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) ||
      index === code.length
    ) {
      segments.push({ from: segmentStart, to: index })
      segmentStart = index + 1
    }
  }

  return segments
}

function isStandaloneIdentifierSegment(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(?:@global)?(?:\[\])?(?::[A-Za-z_][A-Za-z0-9_]*(?:\[\])?)?$/.test(
    value.trim(),
  )
}

function isIndexedOutputSegment(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(?:@global)?(?::[A-Za-z_][A-Za-z0-9_]*(?:\[\])?)?(?:\[[^\]]+\])+$/u.test(
    value.trim(),
  )
}

function isOldStyleOutputSegment(value: string): boolean {
  return isStandaloneIdentifierSegment(value) && !ignoredSemanticVariableNames.has(baseIdentifierName(value))
}

function baseIdentifierName(value: string): string {
  return value.split(":")[0].replace(/@global$/, "")
}

function spanKey(span: Pick<TokenSpan, "from" | "to">): string {
  return `${span.from}:${span.to}`
}

function isKnownOpcode(name: string, userOpcodeSignatures: Map<string, OpcodeSignature[]>): boolean {
  return builtInOpcodeNames.has(name) || userOpcodeSignatures.has(name)
}

function getOpcodeSignatures(
  name: string,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): OpcodeSignature[] {
  return userOpcodeSignatures.get(name) ?? builtInOpcodeSignatures.get(name) ?? []
}

function collectOutputTargetSemantics(
  code: string,
  offset: number,
  opcodeLocalFrom: number,
): OutputTargetSemantics | null {
  const prefix = code.slice(0, opcodeLocalFrom)
  if (!prefix.trim()) return { outputSpans: [], inputSpans: [] }
  if (/[=+\-*\/%^|&!?<>]/.test(prefix)) return null

  const outputSpans: OutputSemanticSpan[] = []
  const inputSpans: SemanticSpan[] = []
  let segmentStart = 0
  let bracketDepth = 0

  for (let index = 0; index <= prefix.length; index += 1) {
    const char = prefix[index]
    if (char === "[") bracketDepth += 1
    if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1)

    if ((char === "," && bracketDepth === 0) || index === prefix.length) {
      const span = trimSpan(prefix, segmentStart, index)
      if (!span) return null
      const segmentText = prefix.slice(span.from, span.to)
      const segmentSemantics = collectOutputTargetSegmentSemantics(segmentText, offset + span.from)
      if (!segmentSemantics) return null
      appendSemanticSpans(outputSpans, segmentSemantics.outputSpans)
      appendSemanticSpans(inputSpans, segmentSemantics.inputSpans)
      segmentStart = index + 1
    }
  }

  return { outputSpans, inputSpans }
}

function collectOutputTargetSegmentSemantics(
  segmentText: string,
  segmentOffset: number,
): OutputTargetSemantics | null {
  if (isOldStyleOutputSegment(segmentText)) {
    return {
      outputSpans: [
        {
          from: segmentOffset,
          to: segmentOffset + segmentText.length,
          kind: outputSemanticKindForVariable(segmentText),
          rate: outputRate(segmentText),
        },
      ],
      inputSpans: [],
    }
  }

  if (!isIndexedOutputSegment(segmentText)) return null

  const tokens = collectIdentifierTokens(segmentText, segmentOffset)
  if (tokens.length === 0) return null

  const [targetToken, ...indexTokens] = tokens
  return {
    outputSpans: [
      {
        from: targetToken.from,
        to: targetToken.to,
        kind: outputSemanticKindForVariable(targetToken.value),
        rate: outputRate(targetToken.value),
      },
    ],
    inputSpans: indexTokens.map(token => ({
      from: token.from,
      to: token.to,
      kind: inputSemanticKindForVariable(token.value),
    })),
  }
}

function collectInputSpans(
  code: string,
  tokens: TokenSpan[],
  opcodeTo: number,
  offset: number,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] {
  return tokens
    .filter(token => token.from >= opcodeTo)
    .filter(token => !ignoredSemanticVariableNames.has(token.baseName))
    .filter(token => {
      const localTo = token.to - offset
      return !(isKnownOpcode(token.baseName, userOpcodeSignatures) && nextNonSpaceChar(code, localTo) === "(")
    })
    .map(token => ({
      from: token.from,
      to: token.to,
      kind: inputSemanticKindForVariable(token.value),
    }))
}

function collectAssignmentInputSpans(
  code: string,
  tokens: TokenSpan[],
  assignmentPosition: number,
  offset: number,
  userOpcodeSignatures: Map<string, OpcodeSignature[]>,
): SemanticSpan[] {
  return tokens
    .filter(token => token.from - offset > assignmentPosition)
    .filter(token => !ignoredSemanticVariableNames.has(token.baseName))
    .filter(token => {
      const localTo = token.to - offset
      return !(isKnownOpcode(token.baseName, userOpcodeSignatures) && nextNonSpaceChar(code, localTo) === "(")
    })
    .map(token => ({
      from: token.from,
      to: token.to,
      kind: inputSemanticKindForVariable(token.value),
    }))
}

function findPlainAssignmentSemanticSpans(
  code: string,
  offset: number,
  assignmentPosition: number,
): SemanticSpan[] {
  if (assignmentPosition === -1) return []

  const spans = [
    ...collectPlainAssignmentTargetSpans(code, offset, assignmentPosition),
    ...collectPlainAssignmentValueSpans(code, offset, assignmentPosition),
  ]

  return spans.sort((a, b) => a.from - b.from || a.to - b.to)
}

function collectPlainAssignmentTargetSpans(
  code: string,
  offset: number,
  assignmentPosition: number,
): SemanticSpan[] {
  const left = code.slice(0, assignmentPosition)
  const spans: SemanticSpan[] = []

  for (const segment of splitTopLevelCommaSegments(left)) {
    const trimmed = trimSpan(left, segment.from, segment.to)
    if (!trimmed) continue

    const segmentText = left.slice(trimmed.from, trimmed.to)
    const segmentOffset = offset + trimmed.from
    const tokens = collectIdentifierTokens(segmentText, segmentOffset)
    if (tokens.length === 0) continue

    const [targetToken, ...indexTokens] = tokens
    spans.push({
      from: targetToken.from,
      to: targetToken.to,
      kind: outputSemanticKindForVariable(targetToken.value),
    })

    for (const token of indexTokens) {
      if (tokenStartsFunctionCall(segmentText, segmentOffset, token)) continue
      spans.push({
        from: token.from,
        to: token.to,
        kind: inputSemanticKindForVariable(token.value),
      })
    }
  }

  return spans
}

function collectPlainAssignmentValueSpans(
  code: string,
  offset: number,
  assignmentPosition: number,
): SemanticSpan[] {
  const valueStart = assignmentPosition + assignmentOperatorLength(code, assignmentPosition)
  const right = code.slice(valueStart)
  const rightOffset = offset + valueStart

  return collectIdentifierTokens(right, rightOffset)
    .filter(token => !tokenStartsFunctionCall(right, rightOffset, token))
    .map(token => ({
      from: token.from,
      to: token.to,
      kind: inputSemanticKindForVariable(token.value),
    }))
}

function tokenStartsFunctionCall(code: string, offset: number, token: TokenSpan): boolean {
  return nextNonSpaceChar(code, token.to - offset) === "("
}

function inputSemanticKindForVariable(name: string): "input" | "pField" {
  return isPFieldName(baseIdentifierName(name.trim())) ? "pField" : "input"
}

function outputSemanticKindForVariable(name: string): "output" | "pField" {
  return isPFieldName(baseIdentifierName(name.trim())) ? "pField" : "output"
}

function isPFieldName(name: string): boolean {
  return /^p\d+$/.test(name)
}

function isNamedInstrumentName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
}

function trimSpan(text: string, from: number, to: number): { from: number; to: number } | null {
  while (from < to && /\s/.test(text[from])) from += 1
  while (to > from && /\s/.test(text[to - 1])) to -= 1
  return from < to ? { from, to } : null
}

function signatureAllowsOutputs(
  signatures: OpcodeSignature[],
  outputSpans: OutputSemanticSpan[],
): boolean {
  if (signatures.length === 0) return true

  return signatures.some(signature => {
    const outTypes = parseSignatureTypes(signature.outTypes)
    if (outTypes.kind === "none") return outputSpans.length === 0
    if (outTypes.kind === "wildcard") return outputSpans.length > 0
    if (
      outTypes.types.length !== outputSpans.length &&
      !signatureAllowsOmittedVariableOutputs(outTypes.types, outputSpans.length)
    ) {
      return false
    }

    return outputSpans.every((span, index) => isOutputTypeCompatible(outTypes.types[index], span.rate))
  })
}

function signatureAllowsOmittedVariableOutputs(signatureTypes: string[], outputCount: number): boolean {
  if (outputCount === 0 || outputCount > signatureTypes.length) return false
  return signatureTypes.slice(outputCount).every(isVariableOutputType)
}

function parseSignatureTypes(
  rawTypes: string,
): { kind: "none" } | { kind: "wildcard" } | { kind: "types"; types: string[] } {
  const value = rawTypes.trim()
  if (value === "(null)") return { kind: "none" }
  if (value === "*") return { kind: "wildcard" }

  const types: string[] = []
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (/\s/.test(char)) continue

    if (char === ":") {
      const end = value.indexOf(";", index)
      if (end === -1) {
        types.push(value.slice(index))
        break
      }
      const hasArray = value.slice(end + 1, end + 3) === "[]"
      types.push(value.slice(index, hasArray ? end + 3 : end + 1))
      index = hasArray ? end + 2 : end
      continue
    }

    if (value.slice(index + 1, index + 3) === "[]") {
      types.push(`${char}[]`)
      index += 2
      continue
    }

    types.push(char)
  }

  return { kind: "types", types }
}

function outputRate(outputText: string): string | null {
  const explicitTypeRate = typedIdentifierRate(outputText)
  if (explicitTypeRate) return explicitTypeRate

  const firstIdentifier = outputText.match(/[A-Za-z_][A-Za-z0-9_]*/) ?? []
  const name = firstIdentifier[0]
  if (!name) return null
  if (name[0] === "g" && /^[akifSpBba]/.test(name[1] ?? "")) return name[1]
  return name[0]
}

function typedIdentifierRate(value: string): string | null {
  const match = value.trim().match(/:([A-Za-z_][A-Za-z0-9_]*)(?:\[\])?$/)
  return match?.[1]?.[0] ?? null
}

function isOutputTypeCompatible(signatureType: string, rate: string | null): boolean {
  if (!rate) return true
  const normalized = signatureType.replace(/\[\]$/, "")
  if (normalized === "*" || normalized === ".") return true
  if (normalized.startsWith(":")) return true
  if (normalized === "m" || normalized === "z" || normalized === "y") return true
  if (rate === "p") return normalized === "i" || normalized[0] === "p"
  return normalized[0] === rate
}

function isVariableOutputType(signatureType: string): boolean {
  const normalized = signatureType.replace(/\[\]$/, "")
  return normalized === "m" || normalized === "z" || normalized === "y"
}

function assignmentOperatorLength(code: string, assignmentPosition: number): number {
  return code[assignmentPosition] === "=" ? 1 : 2
}

function findAssignmentPosition(code: string): number {
  for (let index = 0; index < code.length; index += 1) {
    const char = code[index]
    const next = code[index + 1]

    if ((char === "+" || char === "-" || char === "*" || char === "/" || char === "%") && next === "=") {
      return index
    }

    if (char !== "=") continue
    const previous = code[index - 1]
    if (previous === "=" || previous === "<" || previous === ">" || previous === "!") continue
    if (next === "=") continue
    return index
  }

  return -1
}

function startsAssignmentOperator(text: string, start: number): boolean {
  const index = nextNonSpacePosition(text, start)
  if (index === null) return false

  const char = text[index]
  const next = text[index + 1]

  if (char === "=") return next !== "="
  return (char === "+" || char === "-" || char === "*" || char === "/" || char === "%") && next === "="
}

function nextNonSpaceChar(text: string, start: number): string | undefined {
  const index = nextNonSpacePosition(text, start)
  return index === null ? undefined : text[index]
}

function nextNonSpacePosition(text: string, start: number): number | null {
  for (let index = start; index < text.length; index += 1) {
    if (!/\s/.test(text[index])) return index
  }
  return null
}

function previousNonSpacePositionInText(text: string, start: number): number | null {
  for (let index = start; index >= 0; index -= 1) {
    if (!/\s/.test(text[index])) return index
  }
  return null
}

function previousNonSpacePosition(view: EditorView, start: number): number | null {
  const documentText = view.state.doc.toString()
  return previousNonSpacePositionInText(documentText, start)
}

function maskNonCodeText(text: string): string {
  const chars = [...text]

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    const next = chars[index + 1]

    if (char === ";") {
      index = maskUntilLineEnd(chars, index)
      continue
    }

    if (char === "/" && next === "/") {
      index = maskUntilLineEnd(chars, index)
      continue
    }

    if (char === '"') {
      index = maskQuotedString(chars, index)
      continue
    }

    if (char === "{" && next === "{") {
      index = maskDelimited(chars, index, "}}")
      continue
    }

    if (char === "R" && next === "{") {
      index = maskDelimited(chars, index, "}R")
    }
  }

  return chars.join("")
}

function maskUntilLineEnd(chars: string[], start: number): number {
  let index = start
  while (index < chars.length && chars[index] !== "\n") {
    chars[index] = " "
    index += 1
  }
  return index
}

function maskQuotedString(chars: string[], start: number): number {
  chars[start] = " "
  let index = start + 1

  while (index < chars.length) {
    const char = chars[index]
    chars[index] = " "

    if (char === "\\") {
      index += 1
      if (index < chars.length) chars[index] = " "
    } else if (char === '"') {
      return index
    }

    index += 1
  }

  return index
}

function maskDelimited(chars: string[], start: number, endDelimiter: string): number {
  let index = start
  while (index < chars.length) {
    const atEnd = endDelimiter.split("").every((char, offset) => chars[index + offset] === char)
    chars[index] = " "

    if (atEnd) {
      for (let offset = 1; offset < endDelimiter.length; offset += 1) {
        if (index + offset < chars.length) chars[index + offset] = " "
      }
      return index + endDelimiter.length - 1
    }

    index += 1
  }

  return index
}
