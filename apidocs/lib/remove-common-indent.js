// Strip the longest run of leading whitespace shared by every non-blank line.
// Mirrors the Gatsby helper: detects whether the indent uses spaces or tabs
// based on the first non-empty line; mixed indentation is left alone.

export function removeCommonIndent(content) {
  if (!content) {
    return "";
  }

  const lines = content.split(/[\r\n]/);
  if (!lines.length) {
    return content;
  }

  let indentChar;
  for (const l of lines) {
    if (l.length > 0) {
      indentChar = l[0];
      break;
    }
  }
  if (indentChar !== " " && indentChar !== "\t") {
    return content;
  }

  let min = Infinity;
  for (const l of lines) {
    if (!l.trim().length) {
      continue;
    }
    let c = 0;
    while (c < l.length && l[c] === indentChar) {
      c++;
    }
    if (c < min) {
      min = c;
    }
  }
  if (!Number.isFinite(min)) {
    return content;
  }

  return lines.map(l => l.slice(min)).join("\n");
}
