// Match the grammar's identifier range, including non-ASCII Csound names.
export const identifierSource = "[A-Za-z_\\u00a1-\\u{10ffff}][A-Za-z0-9_\\u00a1-\\u{10ffff}]*"
export const typedIdentifierSource = identifierSource + "(?:@global)?(?::" + identifierSource + "(?:\\[\\])*)?"
