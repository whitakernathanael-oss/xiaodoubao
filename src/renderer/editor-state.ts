import type { Theme } from "../shared/contracts";

export interface EditorState {
  theme: Theme;
  dirty: boolean;
}

function clone(theme: Theme): Theme {
  return structuredClone(theme);
}

export function createEditorState(theme: Theme): EditorState {
  return { theme: clone(theme), dirty: false };
}

export function updateField(state: EditorState, path: readonly string[], value: unknown): EditorState {
  if (path.length === 0 || path.some((part) => part === "__proto__" || part === "prototype" || part === "constructor")) {
    throw new Error("Editor field path is invalid");
  }
  const theme = clone(state.theme);
  let cursor: Record<string, unknown> = theme as unknown as Record<string, unknown>;
  for (const part of path.slice(0, -1)) {
    const next = cursor[part];
    if (next === null || typeof next !== "object" || Array.isArray(next)) throw new Error("Editor field path is invalid");
    cursor = next as Record<string, unknown>;
  }
  const leaf = path.at(-1)!;
  if (!(leaf in cursor)) throw new Error("Editor field path is invalid");
  cursor[leaf] = value;
  return { theme, dirty: true };
}
