import {
  csoundNodeNames as nodes,
  csoundNodeGroups,
  csoundNodeSet,
  type CsoundNodeName,
  type CsoundTopNodeName,
} from "@kunstmusik/codemirror-lang-csound/syntax"

const name: CsoundNodeName = nodes.TypedIdentifier
const top: CsoundTopNodeName = "OrchestraFile"
const identifiers = csoundNodeSet(csoundNodeGroups.CsoundIdentifier)
identifiers.has("raw Lezer names are strings")
csoundNodeSet([name, nodes.PField])
const rules = { [name]: true } satisfies Partial<Record<CsoundNodeName, boolean>>

// @ts-expect-error Misspelled node names must fail at the consumer's definition.
csoundNodeSet(["TypedIndentifier"])
// @ts-expect-error A generated node property must not silently become undefined.
nodes.TypedIndentifier
// @ts-expect-error Generator term symbols are not syntax-tree names.
csoundNodeSet(["_if"])
// @ts-expect-error Not every named node is a parser root.
const invalidTop: CsoundTopNodeName = "Identifier"
// @ts-expect-error Generated groups must remain immutable.
csoundNodeGroups.CsoundIdentifier.push(nodes.Number)
// @ts-expect-error Consumer rule maps must reject stale keys.
const invalidRules = { OldIdentifier: true } satisfies Partial<Record<CsoundNodeName, boolean>>
// @ts-expect-error A host cannot mutate a shared set through its interface.
identifiers.add(nodes.Number)

void [top, rules, invalidTop, invalidRules]
