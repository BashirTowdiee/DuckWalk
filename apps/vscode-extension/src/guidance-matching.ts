import { normaliseCode } from "@duckwalk/core";

const openerToCloser = new Map<string, string>([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ['"', '"'],
  ["'", "'"],
  ["`", "`"]
]);

const quoteDelimiters = new Set(['"', "'", "`"]);

function normaliseNewlines(input: string): string {
  return input.replace(/\r\n/g, "\n");
}

function isEscaped(text: string, index: number): boolean {
  let backslashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function getUnclosedDelimiters(text: string): string[] {
  const stack: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const top = stack.at(-1);

    if (top && quoteDelimiters.has(top)) {
      if (char === top && !isEscaped(text, index)) {
        stack.pop();
      }
      continue;
    }

    if (quoteDelimiters.has(char)) {
      stack.push(char);
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      stack.push(char);
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      const expectedCloser = top ? openerToCloser.get(top) : null;
      if (expectedCloser === char) {
        stack.pop();
      }
    }
  }

  return stack;
}

function findMatchingCloserIndex(remainder: string, opener: string): number | null {
  const expectedCloser = openerToCloser.get(opener);
  if (!expectedCloser) {
    return null;
  }

  if (quoteDelimiters.has(opener)) {
    for (let index = 0; index < remainder.length; index += 1) {
      if (remainder[index] === expectedCloser && !isEscaped(remainder, index)) {
        return index;
      }
    }

    return null;
  }

  let depth = 1;
  let activeQuote: string | null = null;

  for (let index = 0; index < remainder.length; index += 1) {
    const char = remainder[index]!;

    if (activeQuote) {
      if (char === activeQuote && !isEscaped(remainder, index)) {
        activeQuote = null;
      }
      continue;
    }

    if (quoteDelimiters.has(char)) {
      activeQuote = char;
      continue;
    }

    if (char === opener) {
      depth += 1;
      continue;
    }

    if (char === expectedCloser) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return null;
}

function countReusableAutoClosedSuffix(
  actualPrefix: string,
  actualSuffix: string,
  remainingGhostCode: string
): number {
  const unclosedDelimiters = getUnclosedDelimiters(actualPrefix);
  let suffixIndex = 0;
  let searchOffset = 0;

  while (suffixIndex < actualSuffix.length && unclosedDelimiters.length > 0) {
    const opener = unclosedDelimiters.at(-1);
    const suffixChar = actualSuffix[suffixIndex];

    if (!opener || !suffixChar || openerToCloser.get(opener) !== suffixChar) {
      break;
    }

    const closerIndex = findMatchingCloserIndex(remainingGhostCode.slice(searchOffset), opener);
    if (closerIndex === null) {
      break;
    }

    unclosedDelimiters.pop();
    searchOffset += closerIndex + 1;
    suffixIndex += 1;
  }

  return suffixIndex;
}

function getLeadingOverlapLength(expectedTail: string, actualSuffix: string): number {
  const maxOverlap = Math.min(expectedTail.length, actualSuffix.length);

  for (let length = maxOverlap; length > 0; length -= 1) {
    if (expectedTail.slice(-length) === actualSuffix.slice(0, length)) {
      return length;
    }
  }

  return 0;
}

function getSharedPrefixLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  let length = 0;

  while (length < maxLength && left[length] === right[length]) {
    length += 1;
  }

  return length;
}

export function matchGhostCodePrefix(actualText: string, ghostCode: string) {
  let expectedIndex = 0;
  let actualIndex = 0;

  while (actualIndex < actualText.length && expectedIndex < ghostCode.length) {
    if (actualText[actualIndex] === ghostCode[expectedIndex]) {
      actualIndex += 1;
      expectedIndex += 1;
      continue;
    }

    if (/\s/.test(ghostCode[expectedIndex] ?? "") && !/\s/.test(actualText[actualIndex] ?? "")) {
      expectedIndex += 1;
      continue;
    }

    break;
  }

  return { actualIndex, expectedIndex };
}

export function buildDiffPreviewTextFromAnchor(input: {
  actualPrefix: string;
  actualSuffix: string;
  ghostCode: string;
}): string | null {
  return buildGuidancePreviewFromAnchor(input)?.mergedText ?? null;
}

export function getRemainingGhostInsertion(input: {
  actualPrefix: string;
  actualSuffix: string;
  ghostCode: string;
}): string | null {
  const actualPrefix = normaliseNewlines(input.actualPrefix);
  const actualSuffix = normaliseNewlines(input.actualSuffix);
  const ghostCode = normaliseNewlines(input.ghostCode).replace(/\n$/, "");
  const documentTextFromAnchor = `${actualPrefix}${actualSuffix}`;

  if (normaliseCode(documentTextFromAnchor).includes(normaliseCode(ghostCode))) {
    return null;
  }

  const { expectedIndex } = matchGhostCodePrefix(actualPrefix, ghostCode);
  const remainingGhostCode = ghostCode.slice(expectedIndex);
  const reusableSuffixLength = countReusableAutoClosedSuffix(
    actualPrefix,
    actualSuffix,
    remainingGhostCode
  );
  const remainingSuffix = actualSuffix.slice(reusableSuffixLength);
  const sharedPrefixLength = getSharedPrefixLength(remainingGhostCode, remainingSuffix);
  const remainingGhostAfterSharedPrefix = remainingGhostCode.slice(sharedPrefixLength);
  const remainingSuffixAfterSharedPrefix = remainingSuffix.slice(sharedPrefixLength);
  const overlapLength =
    sharedPrefixLength > 0
      ? getLeadingOverlapLength(remainingGhostAfterSharedPrefix, remainingSuffixAfterSharedPrefix)
      : getLeadingOverlapLength(remainingGhostCode, remainingSuffix);

  const insertedText =
    sharedPrefixLength > 0
      ? remainingGhostAfterSharedPrefix.slice(
          0,
          Math.max(remainingGhostAfterSharedPrefix.length - overlapLength, 0)
        )
      : remainingGhostCode.slice(0, Math.max(remainingGhostCode.length - overlapLength, 0));

  return insertedText || null;
}

export function buildGuidancePreviewFromAnchor(input: {
  actualPrefix: string;
  actualSuffix: string;
  ghostCode: string;
}): { mergedText: string; insertedText: string; insertedStart: number; insertedEnd: number } | null {
  const actualPrefix = normaliseNewlines(input.actualPrefix);
  const actualSuffix = normaliseNewlines(input.actualSuffix);
  const ghostCode = normaliseNewlines(input.ghostCode).replace(/\n$/, "");
  const documentTextFromAnchor = `${actualPrefix}${actualSuffix}`;

  if (normaliseCode(documentTextFromAnchor).includes(normaliseCode(ghostCode))) {
    return null;
  }

  const { expectedIndex } = matchGhostCodePrefix(actualPrefix, ghostCode);
  const remainingGhostCode = ghostCode.slice(expectedIndex);
  const reusableSuffixLength = countReusableAutoClosedSuffix(
    actualPrefix,
    actualSuffix,
    remainingGhostCode
  );
  const remainingSuffix = actualSuffix.slice(reusableSuffixLength);
  const sharedPrefixLength = getSharedPrefixLength(remainingGhostCode, remainingSuffix);
  const remainingGhostAfterSharedPrefix = remainingGhostCode.slice(sharedPrefixLength);
  const remainingSuffixAfterSharedPrefix = remainingSuffix.slice(sharedPrefixLength);
  const overlapLength = getLeadingOverlapLength(remainingGhostCode, remainingSuffix);

  if (sharedPrefixLength > 0) {
    const suffixOverlapLength = getLeadingOverlapLength(
      remainingGhostAfterSharedPrefix,
      remainingSuffixAfterSharedPrefix
    );

    const preservedSharedPrefix = remainingSuffix.slice(0, sharedPrefixLength);
    const insertedText = remainingGhostAfterSharedPrefix;

    if (!insertedText) {
      return null;
    }

    const mergedText = `${actualPrefix}${preservedSharedPrefix}${insertedText}${remainingSuffixAfterSharedPrefix.slice(
      suffixOverlapLength
    )}`;
    const insertedStart = actualPrefix.length + preservedSharedPrefix.length;

    return {
      mergedText,
      insertedText,
      insertedStart,
      insertedEnd: insertedStart + insertedText.length
    };
  }

  const insertedText = remainingGhostCode;
  if (!insertedText) {
    return null;
  }

  const mergedText = `${actualPrefix}${insertedText}${remainingSuffix.slice(overlapLength)}`;
  const insertedStart = actualPrefix.length;

  return {
    mergedText,
    insertedText,
    insertedStart,
    insertedEnd: insertedStart + insertedText.length
  };
}
