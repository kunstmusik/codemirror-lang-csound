import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const defaultManualDir = resolve(__dirname, "../../../../manual")
const defaultOutputPath = resolve(__dirname, "../src/opcodes.json")
const defaultRichOutputPath = resolve(__dirname, "../src/opcodes-rich.json")
const opcodeNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/
const syntaxOnlyManualNames = new Set([
  "A4",
  "break",
  "case",
  "continue",
  "do",
  "else",
  "elseif",
  "endif",
  "endin",
  "endop",
  "endsw",
  "fi",
  "for",
  "if",
  "in",
  "instr",
  "ithen",
  "kr",
  "ksmps",
  "kthen",
  "nchnls",
  "nchnlsi",
  "od",
  "opcode",
  "return",
  "sr",
  "struct",
  "switch",
  "then",
  "until",
  "void",
  "while",
  "xin",
  "xout",
])

const args = parseArgs(process.argv.slice(2))
const manualDir = resolve(args.manualDir ?? process.env.CSOUND_MANUAL_DIR ?? defaultManualDir)
const outputPath = resolve(args.output ?? defaultOutputPath)
const richOutputPath = resolve(args.richOutput ?? defaultRichOutputPath)
const includeZ1 = args.z1 !== false

const manualOpcodes = readManualOpcodes(manualDir)
const z1Signatures = includeZ1 ? readZ1Signatures() : new Map()
const opcodesByName = new Map()
let includedManualCount = 0

for (const opcode of manualOpcodes) {
  if (!z1Signatures.has(opcode.name) && syntaxOnlyManualNames.has(opcode.name)) continue
  includedManualCount += 1
  const signatures = z1Signatures.get(opcode.name) ?? opcode.signatures
  opcodesByName.set(opcode.name, {
    ...opcode,
    signatures,
    signatureSource: z1Signatures.has(opcode.name)
      ? "csound -z1"
      : opcode.signatures.length > 0
        ? "manual syntax"
        : "none",
  })
}

for (const [name, signatures] of z1Signatures) {
  if (opcodesByName.has(name)) continue
  opcodesByName.set(name, {
    name,
    signatures,
    signatureSource: "csound -z1",
  })
}

const opcodes = Array.from(opcodesByName.values()).sort((a, b) => a.name.localeCompare(b.name))
const signatureCount = opcodes.reduce((count, opcode) => count + opcode.signatures.length, 0)
const manualOnlyCount = opcodes.filter(opcode => opcode.manualPage && opcode.signatureSource !== "csound -z1").length
const z1OnlyCount = opcodes.filter(opcode => !opcode.manualPage && opcode.signatureSource === "csound -z1").length
const coreOpcodes = opcodes.map(toCoreOpcodeEntry)

mkdirSync(dirname(outputPath), { recursive: true })
mkdirSync(dirname(richOutputPath), { recursive: true })

writeCatalog(outputPath, {
  source: includeZ1 ? "Csound manual with csound -z1 signatures" : "Csound manual",
  generatedBy: "scripts/generate-opcode-catalog-from-manual.mjs",
  count: coreOpcodes.length,
  manualCount: includedManualCount,
  skippedSyntaxOnlyManualCount: manualOpcodes.length - includedManualCount,
  z1SignatureOpcodeCount: z1Signatures.size,
  manualOnlyCount,
  z1OnlyCount,
  signatureCount,
  opcodes: coreOpcodes,
})

writeCatalog(richOutputPath, {
  source: includeZ1 ? "Csound manual with csound -z1 signatures" : "Csound manual",
  generatedBy: "scripts/generate-opcode-catalog-from-manual.mjs",
  count: opcodes.length,
  manualCount: includedManualCount,
  skippedSyntaxOnlyManualCount: manualOpcodes.length - includedManualCount,
  z1SignatureOpcodeCount: z1Signatures.size,
  manualOnlyCount,
  z1OnlyCount,
  signatureCount,
  opcodes,
})

console.log(
  `Wrote ${opcodes.length} opcodes, ${signatureCount} signatures, ` +
    `${manualOnlyCount} manual-only entries, core catalog to ${outputPath}, and rich catalog to ${richOutputPath}`,
)

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--manual-dir") {
      parsed.manualDir = argv[++index]
    } else if (arg === "--output") {
      parsed.output = argv[++index]
    } else if (arg === "--rich-output") {
      parsed.richOutput = argv[++index]
    } else if (arg === "--no-z1") {
      parsed.z1 = false
    }
  }
  return parsed
}

function writeCatalog(outputPath, catalog) {
  writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`)
}

function toCoreOpcodeEntry(opcode) {
  return removeEmptyFields({
    name: opcode.name,
    signatures: opcode.signatures,
    shortDescription: opcode.shortDescription,
    category: opcode.category,
    signatureSource: opcode.signatureSource,
  })
}

function readManualOpcodes(root) {
  const opcodesDir = join(root, "docs/opcodes")
  if (!existsSync(opcodesDir)) {
    throw new Error(`Could not find manual opcode directory: ${opcodesDir}`)
  }

  const opcodes = []
  for (const filename of readdirSync(opcodesDir).filter(file => file.endsWith(".md"))) {
    const filePath = join(opcodesDir, filename)
    const data = readFileSync(filePath, "utf8")
    const opcode = parseManualOpcode(data, filename)
    if (!opcode || !opcodeNamePattern.test(opcode.name)) continue
    opcodes.push(opcode)
  }

  return opcodes
}

function parseManualOpcode(data, filename) {
  const heading = data.match(/^#\s+(.+)$/m)
  if (!heading) return null

  const name = stripMarkdown(heading[1]).trim()
  const metadata = parseMetadata(data)
  const syntax = findSyntaxLines(data)
  const signatures = inferSignaturesFromSyntax(name, syntax)
  const examples = Array.from(data.matchAll(/--8<--\s+"examples\/([^"]+\.csd)"/g), match => match[1])

  return removeEmptyFields({
    name,
    signatures,
    shortDescription: findShortDescription(data, heading.index + heading[0].length),
    category: metadata.category,
    status: metadata.status,
    manualId: metadata.id,
    manualPage: `docs/opcodes/${filename}`,
    syntax,
    examples,
  })
}

function parseMetadata(data) {
  const metadata = {}
  const match = data.match(/<!--([\s\S]*?)-->/)
  if (!match) return metadata

  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/)
    if (item) metadata[item[1]] = item[2]
  }

  return metadata
}

function findShortDescription(data, start) {
  const text = data
    .slice(start)
    .replace(/^\s+/, "")
    .split(/\n\s*\n/)[0]
  return stripMarkdown(firstSentence(text)).trim()
}

function firstSentence(text) {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== ".") continue
    const prefix = text.slice(Math.max(0, index - 3), index + 1).toLowerCase()
    if (prefix === "e.g." || prefix === "i.e.") continue
    return text.slice(0, index + 1)
  }
  return text
}

function stripMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
}

function findSyntaxLines(data) {
  const sectionStart = data.search(/^##\s+Syntax\b/m)
  if (sectionStart === -1) return []

  const nextSection = data.slice(sectionStart + 1).search(/^##\s+/m)
  const sectionEnd = nextSection === -1 ? data.length : sectionStart + 1 + nextSection
  const section = data.slice(sectionStart, sectionEnd)
  const lines = []
  const fencePattern = /(^|\n)([ \t]*)```\s*csound-orc[^\n]*\n([\s\S]*?)\n\2```/g

  for (const match of section.matchAll(fencePattern)) {
    const indent = match[2]
    for (const line of match[3].split(/\r?\n/)) {
      const normalized = line.startsWith(indent) ? line.slice(indent.length) : line
      const trimmed = normalized.trim()
      if (trimmed) lines.push(trimmed)
    }
  }

  return unique(lines)
}

function inferSignaturesFromSyntax(name, syntaxLines) {
  const signatures = []

  for (const line of syntaxLines) {
    const signature = inferSignatureFromSyntaxLine(name, line)
    if (signature) signatures.push(signature)
  }

  return uniqueSignatures(signatures)
}

function inferSignatureFromSyntaxLine(name, line) {
  const code = line.replace(/;.*$/, "").trim()
  if (!code) return null

  const escapedName = escapeRegExp(name)
  const modern = code.match(new RegExp(`^(.*?)=\\s*${escapedName}(?::[A-Za-z_][A-Za-z0-9_]*)?\\s*\\((.*)\\)\\s*$`))
  if (modern) {
    return {
      outTypes: inferTypesFromList(modern[1]),
      inTypes: inferTypesFromList(modern[2]),
    }
  }

  const classic = code.match(new RegExp(`^(.*?)\\b${escapedName}\\b\\s*(.*)$`))
  if (classic) {
    return {
      outTypes: inferTypesFromList(classic[1]),
      inTypes: inferTypesFromList(classic[2]),
    }
  }

  return null
}

function inferTypesFromList(value) {
  const items = splitTopLevelList(value)
    .map(cleanSyntaxItem)
    .filter(Boolean)

  if (items.length === 0) return "(null)"

  return items.map(inferTypeFromName).join("")
}

function splitTopLevelList(value) {
  const items = []
  let current = ""
  let parenDepth = 0
  const normalized = value
    .replace(/\[\]/g, "__CSOUND_ARRAY__")
    .replace(/[\[\]]/g, "")
    .replace(/__CSOUND_ARRAY__/g, "[]")

  for (const char of normalized) {
    if (char === "(") parenDepth += 1
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1)

    if (char === "," && parenDepth === 0) {
      items.push(current)
      current = ""
      continue
    }

    current += char
  }

  items.push(current)
  return items
}

function cleanSyntaxItem(value) {
  return value
    .replace(/\[[^\]]*$/g, "")
    .replace(/^[\s[]+|[\s\]]+$/g, "")
    .replace(/\.\.\./g, "")
    .trim()
}

function inferTypeFromName(value) {
  const identifier = value.match(/[A-Za-z_][A-Za-z0-9_]*(?:\[\])?/)?.[0]
  if (!identifier) return "."
  const arraySuffix = identifier.endsWith("[]") ? "[]" : ""
  const name = arraySuffix ? identifier.slice(0, -2) : identifier
  if (name[0] === "g" && /[A-Za-z]/.test(name[1] ?? "")) return `${name[1]}${arraySuffix}`
  if (/[A-Za-z]/.test(name[0] ?? "")) return `${name[0]}${arraySuffix}`
  return `.${arraySuffix}`
}

function readZ1Signatures() {
  const result = spawnSync("csound", ["-z1"], { encoding: "utf8" })
  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  const marker = combinedOutput.match(/\n\s*(\d+)\s+opcodes\b/)
  const signaturesByOpcode = new Map()

  if (!marker) {
    console.warn("Warning: could not parse `csound -z1`; using manual-derived signatures only.")
    return signaturesByOpcode
  }

  const opcodeBlock = combinedOutput.slice(0, marker.index)
  for (const line of opcodeBlock.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s*$/)
    if (!match) continue

    const [, name, outTypes, inTypes] = match
    if (!opcodeNamePattern.test(name)) continue

    const signatures = signaturesByOpcode.get(name) ?? []
    signatures.push({ outTypes, inTypes })
    signaturesByOpcode.set(name, signatures)
  }

  return signaturesByOpcode
}

function unique(values) {
  return [...new Set(values)]
}

function uniqueSignatures(signatures) {
  const seen = new Set()
  const uniqueValues = []

  for (const signature of signatures) {
    const key = `${signature.outTypes}\u0000${signature.inTypes}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueValues.push(signature)
  }

  return uniqueValues
}

function removeEmptyFields(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([key, item]) => {
      if (key === "signatures") return true
      if (Array.isArray(item)) return item.length > 0
      return item !== undefined && item !== ""
    }),
  )
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
