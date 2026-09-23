import type { CsoundNodeName } from "./syntax-nodes.js"

export { csoundNodeNames, csoundNodeGroups, csoundTopNodeNames } from "./syntax-nodes.js"
export type { CsoundNodeName, CsoundTopNodeName } from "./syntax-nodes.js"

/** Check names when defining a set, but accept raw Lezer names when querying it. */
export function csoundNodeSet(names: readonly CsoundNodeName[]): ReadonlySet<string> {
  return new Set(names)
}
