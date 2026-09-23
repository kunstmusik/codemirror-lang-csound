import { parser } from "./parser.js"
import {
  continuedIndent,
  foldInside,
  foldNodeProp,
  indentNodeProp,
  LanguageSupport,
  LRLanguage,
} from "@codemirror/language"
import { styleTags, tags as t, type Tag } from "@lezer/highlight"
import type { CsoundNodeName, CsoundTopNodeName } from "./syntax.js"

import { csoundCompletionSource } from "./completion.js"
import { csoundHover, getCsoundHoverInfo, loadCsoundRichOpcodeCatalog } from "./hover.js"
import {
  analyzeCsoundSemanticLine,
  csoundSemanticHighlighting,
  getCsoundSemanticKind,
  macroArgumentNumberRanges,
  scoreOpcodeEventTypeRange,
  scoreOpcodePFieldNumberRange,
} from "./semantic.js"

export interface CsoundLanguageConfig {
  mode?: "csd" | "orc" | "sco"
  completion?: boolean
  semanticHighlighting?: boolean
  hover?: boolean
}

export { csoundCompletionSource } from "./completion.js"
export { csoundHover, getCsoundHoverInfo, loadCsoundRichOpcodeCatalog } from "./hover.js"
export { csoundOpcodeCatalog } from "./opcodes.js"
export {
  analyzeCsoundSemanticLine,
  csoundSemanticHighlighting,
  getCsoundSemanticKind,
  macroArgumentNumberRanges,
  scoreOpcodeEventTypeRange,
  scoreOpcodePFieldNumberRange,
} from "./semantic.js"

const csoundHighlighting = styleTags({
  LineComment: t.comment,
  BlockComment: t.blockComment,
  LineContinuation: t.comment,

  String: t.string,
  RawString: t.string,
  Number: t.number,
  PField: t.standard(t.variableName),
  ScoreRelativePFieldName: t.standard(t.variableName),
  ScoreCarry: t.constant(t.variableName),
  HeaderIdentifier: t.constant(t.variableName),
  BooleanLiteral: t.bool,
  HeaderPrefixedIdentifier: t.variableName,
  ArrayIdentifier: t.variableName,
  GlobalTypedArrayIdentifier: t.variableName,
  GlobalTypedIdentifier: t.variableName,
  LegacyTypeIdentifier: t.variableName,
  TypedArrayIdentifier: t.variableName,
  TypedIdentifier: t.variableName,

  CsdOpenTag: t.processingInstruction,
  CsdCloseTag: t.processingInstruction,
  CsdLicenseOpen: t.processingInstruction,
  CsdLicenseClose: t.processingInstruction,
  CsdOptionsOpen: t.processingInstruction,
  CsdOptionsClose: t.processingInstruction,
  CsdInstrumentsOpen: t.processingInstruction,
  CsdInstrumentsClose: t.processingInstruction,
  CsdScoreOpen: t.processingInstruction,
  CsdScoreClose: t.processingInstruction,
  CsdCabbageOpen: t.processingInstruction,
  CsdCabbageClose: t.processingInstruction,

  instr: t.definitionKeyword,
  endin: t.definitionKeyword,
  opcode: t.definitionKeyword,
  endop: t.definitionKeyword,
  struct: t.definitionKeyword,
  declare: t.definitionKeyword,

  if: t.controlKeyword,
  then: t.controlKeyword,
  ithen: t.controlKeyword,
  kthen: t.controlKeyword,
  elseif: t.controlKeyword,
  else: t.controlKeyword,
  endif: t.controlKeyword,
  fi: t.controlKeyword,

  while: t.controlKeyword,
  until: t.controlKeyword,
  do: t.controlKeyword,
  od: t.controlKeyword,
  for: t.controlKeyword,
  in: t.controlKeyword,

  switch: t.controlKeyword,
  case: t.controlKeyword,
  default: t.controlKeyword,
  endsw: t.controlKeyword,

  goto: t.controlKeyword,
  igoto: t.controlKeyword,
  kgoto: t.controlKeyword,
  rigoto: t.controlKeyword,
  reinit: t.controlKeyword,

  break: t.controlKeyword,
  continue: t.controlKeyword,
  return: t.controlKeyword,
  rireturn: t.controlKeyword,

  xin: t.controlKeyword,
  xout: t.controlKeyword,
  void: t.definitionKeyword,

  true: t.bool,
  false: t.bool,

  HashInclude: t.moduleKeyword,
  HashIncludestr: t.moduleKeyword,
  HashDefine: t.definitionKeyword,
  HashIfdef: t.controlKeyword,
  HashIfndef: t.controlKeyword,
  HashUndef: t.definitionKeyword,
  HashElse: t.controlKeyword,
  HashEnd: t.controlKeyword,

  MacroUsage: t.macroName,
  MacroUsageToken: t.macroName,

  Identifier: t.variableName,
  LabelName: t.labelName,
  "FunctionCallee/...": t.function(t.variableName),
  "ScoreFunctionCallee/...": t.function(t.variableName),

  // styleTags uses "/" as a node-path separator, so slash operators need
  // named grammar nodes before punctuation can be highlighted safely.
} satisfies Partial<Record<CsoundNodeName | `${CsoundNodeName}/...`, Tag | readonly Tag[]>>)

const parserWithProps = parser.configure({
  props: [
    csoundHighlighting,
    indentNodeProp.add({
      InstrumentDefinition: continuedIndent({ except: /^\s*endin/ }),
      LegacyUdo: continuedIndent({ except: /^\s*endop/ }),
      ModernUdo: continuedIndent({ except: /^\s*endop/ }),
      IfStatement: continuedIndent({ except: /^\s*(endif|fi|else|elseif)/ }),
      WhileLoop: continuedIndent({ except: /^\s*od/ }),
      UntilLoop: continuedIndent({ except: /^\s*(od|enduntil)/ }),
      ForLoop: continuedIndent({ except: /^\s*od/ }),
      SwitchStatement: continuedIndent({ except: /^\s*(case|default|endsw)/ }),
    } satisfies Partial<Record<CsoundNodeName, ReturnType<typeof continuedIndent>>>),
    foldNodeProp.add({
      InstrumentDefinition: foldInside,
      LegacyUdo: foldInside,
      ModernUdo: foldInside,
      IfStatement: foldInside,
      WhileLoop: foldInside,
      UntilLoop: foldInside,
      ForLoop: foldInside,
      SwitchStatement: foldInside,
      OptionsBlock: foldInside,
      InstrumentsBlock: foldInside,
      ScoreBlock: foldInside,
      ScoreNestableLoop: foldInside,
      CabbageBlock: foldInside,
    } satisfies Partial<Record<CsoundNodeName, typeof foldInside>>),
  ],
})

function makeLanguage(name: string, top: CsoundTopNodeName, completion = true): LRLanguage {
  return LRLanguage.define({
    name,
    parser: parserWithProps.configure({ top }),
    languageData: {
      commentTokens: { line: ";", block: { open: "/*", close: "*/" } },
      closeBrackets: { brackets: ["(", "[", "{", '"'] },
      ...(completion ? { autocomplete: csoundCompletionSource } : {}),
    },
  })
}

export const csoundCsdLanguage = makeLanguage("csound-csd", "CsdFile")
export const csoundOrcLanguage = makeLanguage("csound-orc", "OrchestraFile")
export const csoundScoLanguage = makeLanguage("csound-sco", "ScoreFile")

export function csound(config?: CsoundLanguageConfig): LanguageSupport {
  const mode = config?.mode ?? "csd"
  const language =
    config?.completion === false
      ? makeLanguage(
          `csound-${mode}`,
          mode === "orc" ? "OrchestraFile" : mode === "sco" ? "ScoreFile" : "CsdFile",
          false,
        )
      : mode === "orc"
        ? csoundOrcLanguage
        : mode === "sco"
          ? csoundScoLanguage
          : csoundCsdLanguage
  const support = []
  if (config?.semanticHighlighting !== false) support.push(csoundSemanticHighlighting())
  if (config?.hover !== false) support.push(csoundHover())
  return new LanguageSupport(language, support)
}
