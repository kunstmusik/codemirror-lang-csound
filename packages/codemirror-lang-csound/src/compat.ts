import { csound, type CsoundLanguageConfig } from "./index.js"

export {
  csoundCsdLanguage as csdLanguage,
  csoundOrcLanguage as orcLanguage,
  csoundScoLanguage as scoLanguage,
} from "./index.js"

/** Temporary language-only adapter for @hlolli consumers. */
export interface CsoundModeOptions {
  fileType?: CsoundLanguageConfig["mode"]
  enableCompletion?: boolean
}

/** Hosts supply their own colors, panels, and evaluation policy. */
export function csoundMode(options: CsoundModeOptions = {}) {
  return csound({
    mode: options.fileType,
    completion: options.enableCompletion,
    semanticHighlighting: false,
    hover: false,
  })
}
