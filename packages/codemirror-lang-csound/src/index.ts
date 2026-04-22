import { parser } from "./parser.js"
import {
  continuedIndent,
  foldInside,
  foldNodeProp,
  indentNodeProp,
  LanguageSupport,
  LRLanguage,
} from "@codemirror/language"
import { styleTags, tags as t } from "@lezer/highlight"

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
  HeaderIdentifier: t.definition(t.variableName),
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

  "if _if": t.controlKeyword,
  then: t.controlKeyword,
  ithen: t.controlKeyword,
  kthen: t.controlKeyword,
  elseif: t.controlKeyword,
  "else _else": t.controlKeyword,
  endif: t.controlKeyword,
  fi: t.controlKeyword,

  "while _while": t.controlKeyword,
  until: t.controlKeyword,
  "do _do": t.controlKeyword,
  od: t.controlKeyword,
  "for _for": t.controlKeyword,
  "in _in": t.controlKeyword,

  "switch _switch": t.controlKeyword,
  "case _case": t.controlKeyword,
  "default _default": t.controlKeyword,
  endsw: t.controlKeyword,

  goto: t.controlKeyword,
  igoto: t.controlKeyword,
  kgoto: t.controlKeyword,
  rigoto: t.controlKeyword,
  reinit: t.controlKeyword,

  "break _break": t.controlKeyword,
  "continue _continue": t.controlKeyword,
  "return _return": t.controlKeyword,
  rireturn: t.controlKeyword,

  xin: t.controlKeyword,
  xout: t.controlKeyword,
  "void _void": t.definitionKeyword,

  "true _true": t.bool,
  "false _false": t.bool,

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
})

const parserWithProps = parser.configure({
  props: [
    csoundHighlighting,
    indentNodeProp.add({
      InstrumentDefinition: continuedIndent({ except: /^\s*endin/ }),
      LegacyUdo: continuedIndent({ except: /^\s*endop/ }),
      ModernUdo: continuedIndent({ except: /^\s*endop/ }),
      IfStatement: continuedIndent({ except: /^\s*(endif|fi|else|elseif)/ }),
      WhileLoop: continuedIndent({ except: /^\s*od/ }),
      UntilLoop: continuedIndent({ except: /^\s*od/ }),
      ForLoop: continuedIndent({ except: /^\s*od/ }),
      SwitchStatement: continuedIndent({ except: /^\s*endsw/ }),
    }),
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
    }),
  ],
})

function makeLanguage(name: string, top: string): LRLanguage {
  return LRLanguage.define({
    name,
    parser: parserWithProps.configure({ top }),
    languageData: {
      commentTokens: { line: ";" },
      closeBrackets: { stringPrefixes: ['"'] },
      autocomplete: csoundCompletionSource,
    },
  })
}

export const csoundCsdLanguage = makeLanguage("csound-csd", "CsdFile")
export const csoundOrcLanguage = makeLanguage("csound-orc", "OrchestraFile")
export const csoundScoLanguage = makeLanguage("csound-sco", "ScoreFile")

export function csound(config?: CsoundLanguageConfig): LanguageSupport {
  const mode = config?.mode ?? "csd"
  const language =
    mode === "orc"
      ? csoundOrcLanguage
      : mode === "sco"
        ? csoundScoLanguage
        : csoundCsdLanguage
  const support = []
  if (config?.semanticHighlighting !== false) support.push(csoundSemanticHighlighting())
  if (config?.hover !== false) support.push(csoundHover())
  return new LanguageSupport(language, support)
}
