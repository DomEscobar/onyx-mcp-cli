export interface ParsedProp {
  name: string;
  type: string;
  docs: string;
  optional: boolean;
}

function findPropsTypeEqualsIndex(content: string): number {
  const decl = /export\s+type\s+Onyx\w+Props\b/g;
  const hit = decl.exec(content);
  if (!hit || hit.index === undefined) return -1;

  let i = hit.index + hit[0].length;
  let angle = 0;
  let paren = 0;
  let bracket = 0;
  let inStr: '"' | "'" | "`" | null = null;

  while (i < content.length) {
    const ch = content[i];
    const prev = i > 0 ? content[i - 1] : "";

    if (inStr) {
      if (ch === inStr && prev !== "\\") inStr = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      i++;
      continue;
    }

    if (ch === "<") angle++;
    else if (ch === ">") {
      if (prev !== "=" && angle > 0) angle--;
    } else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket = Math.max(0, bracket - 1);

    if (ch === "=" && angle === 0 && paren === 0 && bracket === 0) {
      return i;
    }
    i++;
  }

  return -1;
}

function extractBalancedBlock(s: string, braceIndex: number): string | null {
  if (s[braceIndex] !== "{") return null;
  let depth = 0;
  for (let i = braceIndex; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(braceIndex, i + 1);
    }
  }
  return null;
}

export function extractMainPropsObject(typesContent: string): string | null {
  const eq = findPropsTypeEqualsIndex(typesContent);
  if (eq === -1) return null;
  const start = eq + 1;
  const rest = typesContent.slice(start);

  const lastAnd = rest.lastIndexOf("& {");
  if (lastAnd !== -1) {
    return extractBalancedBlock(rest, lastAnd + 2);
  }

  const lastAndNoSpace = rest.lastIndexOf("&{");
  if (lastAndNoSpace !== -1) {
    return extractBalancedBlock(rest, lastAndNoSpace + 1);
  }

  const brace = rest.indexOf("{");
  if (brace !== -1) {
    return extractBalancedBlock(rest, brace);
  }

  return null;
}

function cleanJSDoc(raw: string): string {
  return raw
    .replace(/^\/\*\*|\*\/$/g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\* ?/, "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function scanTypeValue(s: string, start: number): { end: number; value: string } {
  let i = start;
  let depth = 0;
  let angle = 0;
  let paren = 0;
  let bracket = 0;
  let inStr: '"' | "'" | "`" | null = null;

  while (i < s.length) {
    const ch = s[i];
    const prev = i > 0 ? s[i - 1] : "";

    if (inStr) {
      if (ch === inStr && prev !== "\\") inStr = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      i++;
      continue;
    }

    if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket = Math.max(0, bracket - 1);
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth = Math.max(0, depth - 1);
    } else if (ch === "<") {
      angle++;
    } else if (ch === ">") {
      if (prev !== "=" && angle > 0) angle--;
    }

    if (ch === ";" && depth === 0 && paren === 0 && angle === 0 && bracket === 0) {
      return { end: i, value: s.slice(start, i).trim() };
    }
    i++;
  }

  return { end: i, value: s.slice(start, i).trim() };
}

export function parsePropsFromObjectBlock(block: string): ParsedProp[] {
  const inner = block.slice(1, -1).trim();
  if (!inner) return [];

  const props: ParsedProp[] = [];
  let i = 0;

  while (i < inner.length) {
    while (i < inner.length && /\s/.test(inner[i])) i++;

    let docs = "";
    if (inner.slice(i, i + 3) === "/**") {
      const end = inner.indexOf("*/", i + 3);
      if (end === -1) break;
      docs = cleanJSDoc(inner.slice(i, end + 2));
      i = end + 2;
      while (i < inner.length && /\s/.test(inner[i])) i++;
    }

    const nameMatch = /^(\w+)(\?)?:/.exec(inner.slice(i));
    if (!nameMatch) {
      i++;
      continue;
    }
    const name = nameMatch[1];
    const optional = nameMatch[2] === "?";
    i += nameMatch[0].length;

    const { end, value: typeStr } = scanTypeValue(inner, i);
    i = end + 1;

    if (name && typeStr) {
      props.push({ name, type: typeStr, docs, optional });
    }
  }

  return props;
}

export function parsePropsFromTypesFile(content: string): ParsedProp[] {
  const block = extractMainPropsObject(content);
  if (!block) return [];
  return parsePropsFromObjectBlock(block);
}
