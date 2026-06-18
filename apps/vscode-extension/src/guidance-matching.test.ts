import { describe, expect, it } from "vitest";

import {
  buildGuidancePreviewFromAnchor,
  buildDiffPreviewTextFromAnchor,
  getRemainingGhostInsertion,
  matchGhostCodePrefix
} from "./guidance-matching";

describe("matchGhostCodePrefix", () => {
  it("treats skipped expected whitespace as a soft match", () => {
    expect(matchGhostCodePrefix('"start":"node', '"start": "node src/server.js"')).toEqual({
      actualIndex: 13,
      expectedIndex: 14
    });
  });
});

describe("buildDiffPreviewTextFromAnchor", () => {
  it("keeps an auto-closed quote in the correct final position", () => {
    const preview = buildDiffPreviewTextFromAnchor({
      actualPrefix: '  "start": "node',
      actualSuffix: '"',
      ghostCode: '  "start": "node src/server.js",\n'
    });

    expect(preview).toBe('  "start": "node src/server.js",');
  });

  it("reuses already-typed quoted suffix text after the cursor", () => {
    const preview = buildDiffPreviewTextFromAnchor({
      actualPrefix: '{\n  "name": "demo-fastify-app",\n  "version": "1.0.0",\n  "private": true,\n  "ty',
      actualSuffix: 'pe": "module"\n}',
      ghostCode: `{
  "name": "demo-fastify-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js"
  },
  "dependencies": {
    "fastify": "^5.0.0"
  }
}
`
    });

    expect(preview).toBe(`{
  "name": "demo-fastify-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js"
  },
  "dependencies": {
    "fastify": "^5.0.0"
  }
}`);
  });

  it("keeps nested auto-closed delimiters in the correct final positions", () => {
    const preview = buildDiffPreviewTextFromAnchor({
      actualPrefix: "const config = { values: [",
      actualSuffix: "]}",
      ghostCode: 'const config = { values: ["fastify"] };\n'
    });

    expect(preview).toBe('const config = { values: ["fastify"] };');
  });

  it("leaves unrelated suffix text untouched", () => {
    const preview = buildDiffPreviewTextFromAnchor({
      actualPrefix: "const value = foo(",
      actualSuffix: ");\nconsole.log(value);\n",
      ghostCode: 'const value = foo("bar");\n'
    });

    expect(preview).toBe('const value = foo("bar");\nconsole.log(value);\n');
  });

  it("returns null when the guided implementation already exists", () => {
    const preview = buildDiffPreviewTextFromAnchor({
      actualPrefix: "export const ready = true;\n",
      actualSuffix: "",
      ghostCode: "export const ready = true;\n"
    });

    expect(preview).toBeNull();
  });
});

describe("getRemainingGhostInsertion", () => {
  it("returns only the missing suffix for a partially typed line", () => {
    const remaining = getRemainingGhostInsertion({
      actualPrefix: '    "start": "node src',
      actualSuffix: '"\n  }\n}',
      ghostCode: `    "start": "node src/server.js"
  }
}
`
    });

    expect(remaining).toBe('/server.js"');
  });

  it("returns inserted follow-up lines without duplicating reusable closers", () => {
    const remaining = getRemainingGhostInsertion({
      actualPrefix: '{\n  "type": "module"',
      actualSuffix: "\n}",
      ghostCode: `{
  "type": "module",
  "scripts": {
    "start": "node src/server.js"
  }
}
`
    });

    expect(remaining).toBe(',\n  "scripts": {\n    "start": "node src/server.js"\n  }');
  });
});

describe("buildGuidancePreviewFromAnchor", () => {
  it("returns the full merged preview with the inserted span", () => {
    const preview = buildGuidancePreviewFromAnchor({
      actualPrefix: '{\n  "name": "demo-fastify-app",\n  "version": "1.0.0",\n  "private": true,\n  "type": "module"',
      actualSuffix: "\n}",
      ghostCode: `{
  "name": "demo-fastify-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js"
  },
  "dependencies": {
    "fastify": "^5.0.0"
  }
}
`
    });

    expect(preview).toEqual({
      mergedText: `{
  "name": "demo-fastify-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js"
  },
  "dependencies": {
    "fastify": "^5.0.0"
  }
}`,
      insertedText:
        ',\n  "scripts": {\n    "dev": "node --watch src/server.js",\n    "start": "node src/server.js"\n  },\n  "dependencies": {\n    "fastify": "^5.0.0"\n  }\n}',
      insertedStart: 91,
      insertedEnd: 237
    });
  });
});
