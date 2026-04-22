import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"

import { collectUserOpcodeNames, csoundOpcodeCatalog } from "./opcodes.js"

const completionWord = /[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?/
const completionValidFor = /^[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?$/

const builtInOpcodeCompletions: Completion[] = csoundOpcodeCatalog.opcodes.map(opcode => ({
  label: opcode.name,
  type: "function",
  detail: opcode.category ? `Csound opcode - ${opcode.category}` : "Csound opcode",
  info: opcode.shortDescription,
}))

export function csoundCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(completionWord)
  if (!word && !context.explicit) return null

  const userOpcodeCompletions: Completion[] = Array.from(
    collectUserOpcodeNames(context.state.doc.toString()),
  ).map(label => ({
    label,
    type: "function",
    detail: "UDO",
    boost: 20,
  }))

  return {
    from: word?.from ?? context.pos,
    options: [...userOpcodeCompletions, ...builtInOpcodeCompletions],
    validFor: completionValidFor,
  }
}
