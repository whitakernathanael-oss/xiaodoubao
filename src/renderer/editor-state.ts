import type { Theme, ThemeRegions } from "../shared/contracts";
import { DEFAULT_THEME } from "../shared/defaults";

export interface EditorState {
  theme: Theme;
  undoStack: Theme[];
  dirty: boolean;
}

export type EditableRegion = keyof ThemeRegions | "wallpaper";

function clone(theme: Theme): Theme {
  return structuredClone(theme);
}

export function createEditorState(theme: Theme): EditorState {
  return { theme: clone(theme), undoStack: [], dirty: false };
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
  return {
    theme,
    undoStack: [...state.undoStack, state.theme].slice(-30),
    dirty: true
  };
}

export function undo(state: EditorState): EditorState {
  const previous = state.undoStack.at(-1);
  if (!previous) return state;
  return {
    theme: clone(previous),
    undoStack: state.undoStack.slice(0, -1),
    dirty: true
  };
}

export function resetRegion(state: EditorState, region: EditableRegion): EditorState {
  if (region === "wallpaper") {
    const file = state.theme.wallpaper.file;
    const next = updateField(state, ["wallpaper"], { ...DEFAULT_THEME.wallpaper, file });
    return next;
  }
  return updateField(state, ["regions", region], structuredClone(DEFAULT_THEME.regions[region]));
}
