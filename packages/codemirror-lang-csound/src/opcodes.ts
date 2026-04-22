import opcodeCatalogJson from "./opcodes.json"

export interface OpcodeSignature {
  outTypes: string
  inTypes: string
}

export interface OpcodeCatalogEntry {
  name: string
  signatures: OpcodeSignature[]
  shortDescription?: string
  category?: string
  signatureSource?: string
}

export interface RichOpcodeCatalogEntry extends OpcodeCatalogEntry {
  syntax?: string[]
  status?: string
  manualId?: string
  manualPage?: string
  examples?: string[]
}

export interface OpcodeCatalog<TEntry extends OpcodeCatalogEntry = OpcodeCatalogEntry> {
  source: string
  generatedBy: string
  count: number
  manualCount?: number
  skippedSyntaxOnlyManualCount?: number
  z1SignatureOpcodeCount?: number
  manualOnlyCount?: number
  z1OnlyCount?: number
  signatureCount: number
  opcodes: TEntry[]
}

export const csoundOpcodeCatalog = opcodeCatalogJson as OpcodeCatalog
export const builtInOpcodeNames = new Set(csoundOpcodeCatalog.opcodes.map(opcode => opcode.name))
export const builtInOpcodeSignatures = new Map(
  csoundOpcodeCatalog.opcodes.map(opcode => [opcode.name, opcode.signatures] as const),
)

const udoDefinitionPattern = /^\s*opcode\s+([A-Za-z_][A-Za-z0-9_]*)/gm
const legacyUdoDefinitionPattern =
  /^\s*opcode\s+([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([^,\s]+)\s*,\s*([^;\n]+)/gm
const modernUdoDefinitionPattern =
  /^\s*opcode\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:\s*([^;\n]+)/gm

export function collectUserOpcodeNames(documentText: string): Set<string> {
  return new Set(collectUserOpcodeSignatures(documentText).keys())
}

export function collectUserOpcodeSignatures(documentText: string): Map<string, OpcodeSignature[]> {
  const userOpcodes = new Map<string, OpcodeSignature[]>()

  for (const match of documentText.matchAll(legacyUdoDefinitionPattern)) {
    addUserOpcodeSignature(userOpcodes, match[1], {
      outTypes: match[2].trim(),
      inTypes: match[3].trim(),
    })
  }

  for (const match of documentText.matchAll(modernUdoDefinitionPattern)) {
    addUserOpcodeSignature(userOpcodes, match[1], {
      outTypes: normalizeModernReturnTypes(match[3]),
      inTypes: normalizeModernParamTypes(match[2]),
    })
  }

  for (const match of documentText.matchAll(udoDefinitionPattern)) {
    if (!userOpcodes.has(match[1])) {
      userOpcodes.set(match[1], [{ outTypes: "*", inTypes: "*" }])
    }
  }

  return userOpcodes
}

function addUserOpcodeSignature(
  userOpcodes: Map<string, OpcodeSignature[]>,
  name: string,
  signature: OpcodeSignature,
): void {
  const signatures = userOpcodes.get(name) ?? []
  signatures.push(signature)
  userOpcodes.set(name, signatures)
}

function normalizeModernReturnTypes(returnSpec: string): string {
  const spec = returnSpec.trim()
  if (spec === "void") return "(null)"
  const items = splitCommaList(spec.startsWith("(") && spec.endsWith(")") ? spec.slice(1, -1) : spec)
  return items.map(normalizeModernTypeName).join("")
}

function normalizeModernParamTypes(paramSpec: string): string {
  return splitCommaList(paramSpec)
    .map(param => {
      const trimmed = param.trim()
      const typeAnnotation = trimmed.match(/:([A-Za-z_][A-Za-z0-9_]*(?:\[\])?)$/)?.[1]
      if (typeAnnotation) return normalizeModernTypeName(typeAnnotation)
      return normalizeModernTypeName(trimmed)
    })
    .join("")
}

function normalizeModernTypeName(typeName: string): string {
  const trimmed = typeName.trim()
  if (!trimmed) return "."

  const arraySuffix = trimmed.endsWith("[]") ? "[]" : ""
  const base = arraySuffix ? trimmed.slice(0, -2) : trimmed
  const first = base[0]
  if (first && /[A-Za-z.]/.test(first)) return `${first}${arraySuffix}`
  return `.${arraySuffix}`
}

function splitCommaList(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return []
  return trimmed.split(",").map(item => item.trim()).filter(Boolean)
}
