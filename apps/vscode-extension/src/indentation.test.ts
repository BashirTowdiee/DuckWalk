import { describe, expect, it } from "vitest";

import { adaptCodeIndentation, detectIndentUnit } from "./indentation";

describe("detectIndentUnit", () => {
  it("detects two-space indentation from guided code", () => {
    expect(
      detectIndentUnit(`function test() {
  if (true) {
    return 1;
  }
}
`)
    ).toBe(2);
  });
});

describe("adaptCodeIndentation", () => {
  const ghostCode = `if (true) {
  const value = 1;
  if (value) {
    return value;
  }
}
`;

  it("converts guided code to tabs when the editor prefers tabs", () => {
    expect(adaptCodeIndentation(ghostCode, { insertSpaces: false, tabSize: 2 })).toBe(
      `if (true) {
\tconst value = 1;
\tif (value) {
\t\treturn value;
\t}
}
`
    );
  });

  it("converts guided code to the editor tab size when the editor prefers spaces", () => {
    expect(adaptCodeIndentation(ghostCode, { insertSpaces: true, tabSize: 4 })).toBe(
      `if (true) {
    const value = 1;
    if (value) {
        return value;
    }
}
`
    );
  });
});
