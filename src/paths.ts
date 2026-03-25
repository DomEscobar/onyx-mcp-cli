import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveExportPath(): string {
  const env = process.env.ONYX_EXPORT_PATH;
  if (env) return resolve(env);
  const cwd = resolve(process.cwd(), "schwarzit-onyx-8a5edab282632443.txt");
  if (existsSync(cwd)) return cwd;
  const pkg = fileURLToPath(new URL("../schwarzit-onyx-8a5edab282632443.txt", import.meta.url));
  if (existsSync(pkg)) return pkg;
  throw new Error(
    "Could not find onyx export. Set ONYX_EXPORT_PATH to the schwarzit-onyx *.txt file path.",
  );
}
