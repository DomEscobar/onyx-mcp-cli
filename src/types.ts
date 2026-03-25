import type { ParsedProp } from "./parser/props.js";

export interface ComponentRecord {
  name: string;
  folder: string;
  props: ParsedProp[];
  typesPath: string;
  vuePath?: string;
  examplePaths: string[];
  searchText: string;
}

export interface KnowledgeIndex {
  components: Map<string, ComponentRecord>;
  /** Relative doc path → markdown */
  docs: Map<string, string>;
  /** Full export map (for component .vue excerpts) */
  files: Map<string, string>;
  sitOnyxVersion?: string;
  sourcePath: string;
}
