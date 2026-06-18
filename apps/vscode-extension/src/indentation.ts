export type IndentationPreference = {
  insertSpaces: boolean;
  tabSize: number;
};

function countLeadingWhitespace(line: string): number {
  let index = 0;

  while (index < line.length && /\s/.test(line[index] ?? "")) {
    index += 1;
  }

  return index;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }

  return a || 1;
}

function measureIndentColumns(indent: string, tabWidth: number): number {
  let columns = 0;

  for (const char of indent) {
    if (char === "\t") {
      columns += tabWidth;
    } else if (char === " ") {
      columns += 1;
    }
  }

  return columns;
}

export function detectIndentUnit(code: string, fallback = 2): number {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  let detected: number | null = null;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const indent = line.slice(0, countLeadingWhitespace(line));
    if (!indent) {
      continue;
    }

    const columns = measureIndentColumns(indent, fallback);
    if (columns <= 0) {
      continue;
    }

    detected = detected === null ? columns : gcd(detected, columns);
  }

  return detected && detected > 0 ? detected : fallback;
}

export function adaptCodeIndentation(
  code: string,
  preference: IndentationPreference,
  sourceIndentUnit = detectIndentUnit(code)
): string {
  const normalised = code.replace(/\r\n/g, "\n");
  const targetTabSize = Math.max(preference.tabSize, 1);

  return normalised
    .split("\n")
    .map((line) => {
      if (!line.trim()) {
        return line;
      }

      const leadingLength = countLeadingWhitespace(line);
      const indent = line.slice(0, leadingLength);
      const content = line.slice(leadingLength);
      const indentColumns = measureIndentColumns(indent, sourceIndentUnit);
      const indentLevels = Math.floor(indentColumns / sourceIndentUnit);
      const remainder = indentColumns % sourceIndentUnit;

      if (preference.insertSpaces) {
        return `${" ".repeat(indentLevels * targetTabSize + remainder)}${content}`;
      }

      return `${"\t".repeat(indentLevels)}${" ".repeat(remainder)}${content}`;
    })
    .join("\n");
}
