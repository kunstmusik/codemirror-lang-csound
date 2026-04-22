import { syntaxTree } from "@codemirror/language"
import type { Extension } from "@codemirror/state"
import { EditorView, hoverTooltip, type Tooltip } from "@codemirror/view"

import {
  builtInOpcodeNames,
  collectUserOpcodeSignatures,
  csoundOpcodeCatalog,
  type OpcodeCatalog,
  type OpcodeCatalogEntry,
  type OpcodeSignature,
  type RichOpcodeCatalogEntry,
} from "./opcodes.js"
import { findSemanticSpans } from "./semantic.js"

export interface CsoundHoverInfo {
  name: string
  kind: "builtInOpcode" | "userOpcode"
  signatures: OpcodeSignature[]
  shortDescription?: string
  category?: string
  signatureSource?: string
  syntax?: string[]
  manualId?: string
  manualPage?: string
  examples?: string[]
  status?: string
}

interface HoverTarget {
  from: number
  to: number
  name: string
}

type RichOpcodeCatalogModule = {
  csoundRichOpcodeCatalog: OpcodeCatalog<RichOpcodeCatalogEntry>
}

const identifierPattern = /[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?/g
const coreOpcodeEntriesByName = new Map(
  csoundOpcodeCatalog.opcodes.map(opcode => [opcode.name, opcode] as const),
)

let richCatalogPromise: Promise<OpcodeCatalog<RichOpcodeCatalogEntry>> | null = null
let richOpcodeEntriesByNamePromise: Promise<Map<string, RichOpcodeCatalogEntry>> | null = null

const hoverTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-csoundHoverTooltip": {
    maxWidth: "34rem",
    padding: "0",
    border: "1px solid #3f3f46",
    borderRadius: "0.75rem",
    backgroundColor: "#1a1a1f",
    color: "#d4d4d8",
    boxShadow: "0 18px 48px rgb(0 0 0 / 0.35)",
  },
  ".cm-csoundHoverTooltip__body": {
    display: "grid",
    gap: "0.75rem",
    padding: "0.9rem 1rem",
  },
  ".cm-csoundHoverTooltip__header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
  },
  ".cm-csoundHoverTooltip__title": {
    fontSize: "0.98rem",
    fontWeight: "700",
    letterSpacing: "-0.01em",
  },
  ".cm-csoundHoverTooltip__badge": {
    color: "#9ca3af",
    fontFamily: "monospace",
    fontSize: "0.72rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
  },
  ".cm-csoundHoverTooltip__deprecated": {
    color: "#fca5a5",
  },
  ".cm-csoundHoverTooltip__description": {
    margin: "0",
    fontSize: "0.82rem",
    lineHeight: "1.45",
    color: "#e4e4e7",
  },
  ".cm-csoundHoverTooltip__meta": {
    display: "grid",
    gap: "0.2rem",
    fontSize: "0.74rem",
    color: "#9ca3af",
  },
  ".cm-csoundHoverTooltip__section": {
    display: "grid",
    gap: "0.3rem",
  },
  ".cm-csoundHoverTooltip__sectionLabel": {
    fontFamily: "monospace",
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#a1a1aa",
  },
  ".cm-csoundHoverTooltip__code": {
    margin: "0",
    padding: "0.55rem 0.7rem",
    borderRadius: "0.55rem",
    backgroundColor: "#23232a",
    color: "#f5f5f5",
    fontFamily: "monospace",
    fontSize: "0.75rem",
    lineHeight: "1.45",
    whiteSpace: "pre-wrap",
  },
})

export function csoundHover(): Extension {
  return [
    hoverTheme,
    hoverTooltip(async (view, pos, side) => {
      const target = findHoverTarget(view, pos, side)
      if (!target) return null

      const info = await getCsoundHoverInfo(target.name, {
        documentText: view.state.doc.toString(),
      })
      if (!info) return null

      return createTooltip(target, info)
    }),
  ]
}

export function loadCsoundRichOpcodeCatalog(): Promise<OpcodeCatalog<RichOpcodeCatalogEntry>> {
  if (!richCatalogPromise) {
    richCatalogPromise = loadRichOpcodeCatalogModule().then(module => module.csoundRichOpcodeCatalog)
  }
  return richCatalogPromise
}

export async function getCsoundHoverInfo(
  name: string,
  options?: { documentText?: string },
): Promise<CsoundHoverInfo | null> {
  const userOpcodeSignatures = options?.documentText
    ? collectUserOpcodeSignatures(options.documentText).get(name)
    : undefined

  if (userOpcodeSignatures?.length) {
    return {
      name,
      kind: "userOpcode",
      signatures: userOpcodeSignatures,
      shortDescription: "User-defined opcode in the current document.",
    }
  }

  const coreEntry = coreOpcodeEntriesByName.get(name)
  if (!coreEntry) return null

  let richEntry: RichOpcodeCatalogEntry | undefined
  try {
    richEntry = (await loadRichOpcodeEntriesByName()).get(name)
  } catch {
    richEntry = undefined
  }

  return {
    name,
    kind: "builtInOpcode",
    signatures: coreEntry.signatures,
    shortDescription: coreEntry.shortDescription,
    category: coreEntry.category,
    signatureSource: coreEntry.signatureSource,
    syntax: richEntry?.syntax,
    manualId: richEntry?.manualId,
    manualPage: richEntry?.manualPage,
    examples: richEntry?.examples,
    status: richEntry?.status,
  }
}

async function loadRichOpcodeEntriesByName(): Promise<Map<string, RichOpcodeCatalogEntry>> {
  if (!richOpcodeEntriesByNamePromise) {
    richOpcodeEntriesByNamePromise = loadCsoundRichOpcodeCatalog().then(catalog => {
      return new Map(catalog.opcodes.map(opcode => [opcode.name, opcode] as const))
    })
  }
  return richOpcodeEntriesByNamePromise
}

function createTooltip(target: HoverTarget, info: CsoundHoverInfo): Tooltip {
  return {
    pos: target.from,
    end: target.to,
    above: true,
    create() {
      const dom = renderHoverInfo(info)
      dom.classList.add("cm-csoundHoverTooltip")
      return { dom }
    },
  }
}

function renderHoverInfo(info: CsoundHoverInfo): HTMLElement {
  const body = document.createElement("div")
  body.className = "cm-csoundHoverTooltip__body"

  const header = document.createElement("div")
  header.className = "cm-csoundHoverTooltip__header"

  const title = document.createElement("div")
  title.className = "cm-csoundHoverTooltip__title"
  title.textContent = info.name
  header.append(title)

  const badge = document.createElement("div")
  badge.className = "cm-csoundHoverTooltip__badge"
  badge.textContent = info.kind === "userOpcode" ? "UDO" : "opcode"
  header.append(badge)
  body.append(header)

  if (info.status === "deprecated") {
    const deprecated = document.createElement("div")
    deprecated.className = "cm-csoundHoverTooltip__badge cm-csoundHoverTooltip__deprecated"
    deprecated.textContent = "Deprecated"
    body.append(deprecated)
  }

  if (info.shortDescription) {
    const description = document.createElement("p")
    description.className = "cm-csoundHoverTooltip__description"
    description.textContent = info.shortDescription
    body.append(description)
  }

  const metaLines = [
    info.category ? `Category: ${info.category}` : null,
    info.signatureSource ? `Signature source: ${info.signatureSource}` : null,
    info.manualPage ? `Manual page: ${info.manualPage}` : null,
  ].filter(Boolean)

  if (metaLines.length > 0) {
    const meta = document.createElement("div")
    meta.className = "cm-csoundHoverTooltip__meta"
    meta.textContent = metaLines.join("\n")
    body.append(meta)
  }

  appendCodeSection(body, "Signatures", formatSignatureLines(info))
  appendCodeSection(body, "Syntax", info.syntax?.slice(0, 6) ?? [])

  if (info.examples?.length) {
    appendCodeSection(body, "Examples", info.examples.slice(0, 6))
  }

  return body
}

function appendCodeSection(parent: HTMLElement, label: string, lines: string[]): void {
  if (lines.length === 0) return

  const section = document.createElement("div")
  section.className = "cm-csoundHoverTooltip__section"

  const sectionLabel = document.createElement("div")
  sectionLabel.className = "cm-csoundHoverTooltip__sectionLabel"
  sectionLabel.textContent = label
  section.append(sectionLabel)

  const code = document.createElement("pre")
  code.className = "cm-csoundHoverTooltip__code"
  code.textContent = lines.join("\n")
  section.append(code)
  parent.append(section)
}

function formatSignatureLines(info: CsoundHoverInfo): string[] {
  return unique(info.signatures.map(signature => formatSignature(info.name, signature))).slice(0, 8)
}

function formatSignature(name: string, signature: OpcodeSignature): string {
  const inputs = signature.inTypes === "(null)" ? "" : signature.inTypes
  if (signature.outTypes === "(null)") {
    return `${name}${inputs ? ` ${inputs}` : ""}`
  }
  return `${signature.outTypes} ${name}${inputs ? ` ${inputs}` : ""}`
}

function findHoverTarget(view: EditorView, pos: number, side: number): HoverTarget | null {
  const line = view.state.doc.lineAt(pos)
  const token = matchIdentifierInLine(line.text, pos - line.from, side)
  if (!token) return null

  const name = token.value.split(":")[0]
  const documentText = view.state.doc.toString()
  const userOpcodeSignatures = collectUserOpcodeSignatures(documentText)
  if (!builtInOpcodeNames.has(name) && !userOpcodeSignatures.has(name)) return null

  const from = line.from + token.from
  const to = line.from + token.to
  const normalizedSide = side < 0 ? -1 : side > 0 ? 1 : 0
  const node = syntaxTree(view.state).resolveInner(pos, normalizedSide)

  if (hasAncestor(node, "FunctionCallee") || hasAncestor(node, "ScoreFunctionCallee")) {
    return { from, to, name }
  }

  if (!hasAncestor(node, "OrcGenericLine")) return null

  const opcodeSpans = findSemanticSpans(line.text, line.from, userOpcodeSignatures).filter(span => {
    return span.kind === "builtInOpcode" || span.kind === "userOpcode"
  })

  return opcodeSpans.some(span => span.from === from && span.to === to) ? { from, to, name } : null
}

function matchIdentifierInLine(
  lineText: string,
  offset: number,
  side: number,
): { from: number; to: number; value: string } | null {
  for (const match of lineText.matchAll(identifierPattern)) {
    const value = match[0]
    const from = match.index ?? 0
    const to = from + value.length

    if (side < 0 && offset === from) continue
    if (side > 0 && offset === to) continue
    if (offset < from || offset > to) continue

    return { from, to, value }
  }

  return null
}

function hasAncestor(node: { name: string; parent: { name: string; parent: unknown } | null } | null, name: string): boolean {
  let current = node
  while (current) {
    if (current.name === name) return true
    current = current.parent as typeof node
  }
  return false
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

async function loadRichOpcodeCatalogModule(): Promise<RichOpcodeCatalogModule> {
  const importRichOpcodeCatalog = new Function(
    "return import('@kunstmusik/codemirror-lang-csound/rich')",
  ) as () => Promise<RichOpcodeCatalogModule>
  return importRichOpcodeCatalog()
}