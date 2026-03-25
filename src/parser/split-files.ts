const BLOCK = "\n================================================\nFILE: ";

/**
 * Split the monolithic export (directory tree + FILE blocks) into a path → content map.
 */
export function splitExportFile(raw: string): Map<string, string> {
  const files = new Map<string, string>();
  const parts = raw.split(BLOCK);
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i];
    const headerEnd = segment.indexOf("\n================================================\n");
    if (headerEnd === -1) continue;
    const path = segment.slice(0, headerEnd).trim();
    const content = segment.slice(headerEnd + "\n================================================\n".length);
    if (path && content !== undefined) {
      files.set(path, content.replace(/\r\n/g, "\n"));
    }
  }
  return files;
}
