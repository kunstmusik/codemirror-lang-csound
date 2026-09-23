import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { extname, relative, resolve } from "node:path"
import { parser } from "../src/parser.js"

const argument = process.argv[2]
if (argument === "--help") {
  console.log("Usage: npm run test:csound --workspace packages/codemirror-lang-csound -- /path/to/csound/tests\nOr set CSOUND_TESTS_DIR.")
  process.exit(0)
}
const directory = argument ?? process.env.CSOUND_TESTS_DIR
if (!directory || !existsSync(directory) || !statSync(directory).isDirectory()) {
  console.error("Supply the Csound tests directory as an argument or set CSOUND_TESTS_DIR.")
  process.exit(2)
}
const root = resolve(directory)
const extensions = new Set([".csd", ".orc", ".sco", ".udo"])
const knownMalformed = new Set([
  "commandline/arrays/test_array_copy.csd",
  "commandline/arrays/test_redef_fail.csd",
  "regression/gen16.csd",
])

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return filesIn(path)
    return entry.isFile() && extensions.has(extname(entry.name).toLowerCase()) ? [path] : []
  })
}

function intentional(file, source) {
  const name = file.split("/").pop()
  return knownMalformed.has(file) ||
    /(?:^|[_-])parse[_-]?error(?:[_-]|\.)/i.test(name) ||
    /^(?:syntax-error|malformed-array)\.csd$/i.test(name) ||
    /Expected:\s*parse failure\b|should fail to parse\b|intentionally malformed ORC to trigger lexer\/parser|unmatched bracket\s*\/\s*malformed array/i.test(source)
}

const files = filesIn(root).sort()
if (!files.length) {
  console.error("No Csound source files in " + root)
  process.exit(2)
}
const parsers = {
  ".csd": parser.configure({ top: "CsdFile" }),
  ".orc": parser.configure({ top: "OrchestraFile" }),
  ".udo": parser.configure({ top: "OrchestraFile" }),
  ".sco": parser.configure({ top: "ScoreFile" }),
}
let allowed = 0
let intentionalClean = 0
let unexpected = 0
for (const path of files) {
  const source = readFileSync(path, "utf8")
  const file = relative(root, path).replaceAll("\\", "/")
  const errors = []
  parsers[extname(path).toLowerCase()].parse(source).iterate({ enter(node) {
    if (node.type.isError) errors.push(node.from)
  } })
  if (intentional(file, source)) {
    if (errors.length) allowed++
    else intentionalClean++
  } else if (errors.length) {
    unexpected++
    const lines = errors.slice(0, 5).map(offset => source.slice(0, offset).split("\n").length)
    console.error(file + ": recovery on line(s) " + lines.join(", "))
  }
}
console.log("Scanned " + files.length + " Csound source files.")
console.log("Allowed " + allowed + " intentional error fixtures with recovery; " + intentionalClean + " parsed without recovery.")
console.log(unexpected + " files with unexpected recovery.")
if (unexpected) process.exitCode = 1
