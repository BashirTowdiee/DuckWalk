export type ParsedDiffFile = {
  path: string;
  hunks: Array<{
    header: string;
    lines: string[];
  }>;
};

export function parseUnifiedDiff(diffText: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  const lines = diffText.replace(/\r\n/g, "\n").split("\n");
  let currentFile: ParsedDiffFile | null = null;

  for (const line of lines) {
    if (line.startsWith("+++ b/")) {
      currentFile = {
        path: line.replace("+++ b/", ""),
        hunks: []
      };
      files.push(currentFile);
      continue;
    }

    if (line.startsWith("@@") && currentFile) {
      currentFile.hunks.push({
        header: line,
        lines: []
      });
      continue;
    }

    const currentHunk = currentFile?.hunks[currentFile.hunks.length - 1];
    if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }

  return files;
}
