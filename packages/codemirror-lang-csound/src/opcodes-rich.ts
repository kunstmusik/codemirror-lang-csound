import opcodeCatalogJson from "./opcodes-rich.json"

import type { OpcodeCatalog, OpcodeSignature, RichOpcodeCatalogEntry } from "./opcodes.js"

export type { OpcodeCatalog, OpcodeSignature, RichOpcodeCatalogEntry } from "./opcodes.js"

export const csoundRichOpcodeCatalog = opcodeCatalogJson as OpcodeCatalog<RichOpcodeCatalogEntry>

const richOpcodeEntriesByName = new Map(
  csoundRichOpcodeCatalog.opcodes.map(opcode => [opcode.name, opcode] as const),
)

export function getCsoundRichOpcodeEntry(name: string): RichOpcodeCatalogEntry | undefined {
  return richOpcodeEntriesByName.get(name)
}