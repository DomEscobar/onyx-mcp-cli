import type { ComponentRecord } from "./types.js";

export function formatComponentDetail(
  c: ComponentRecord,
  vueContent: string | undefined,
): string {
  const lines: string[] = [
    `# ${c.name}`,
    "",
    `- **types:** \`${c.typesPath}\``,
    c.vuePath ? `- **source:** \`${c.vuePath}\`` : "- **source:** *(no single root .vue in export — see package Storybook)*",
    "",
    "## Props",
    "",
  ];

  if (c.props.length === 0) {
    lines.push("*(Could not parse props from `types.ts` — open types file in the export or Storybook.)*");
  } else {
    for (const p of c.props) {
      const opt = p.optional ? "optional" : "required";
      lines.push(`### \`${p.name}\` (${opt})`);
      lines.push("");
      lines.push(`Type: \`${p.type}\``);
      if (p.docs) {
        lines.push("");
        lines.push(p.docs);
      }
      lines.push("");
    }
  }

  if (c.examplePaths.length > 0) {
    lines.push("## Example files (paths in export)");
    lines.push("");
    for (const p of c.examplePaths) {
      lines.push(`- \`${p}\``);
    }
    lines.push("");
  }

  if (vueContent) {
    lines.push("## Component source (excerpt)");
    lines.push("");
    lines.push("```vue");
    lines.push(vueContent.trimEnd());
    lines.push("```");
  }

  return lines.join("\n");
}

export function extractDocTitle(md: string): string {
  for (const line of md.split("\n")) {
    const t = line.trim();
    if (t.startsWith("# ")) return t.slice(2).trim();
  }
  return "";
}
