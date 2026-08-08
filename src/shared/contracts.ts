export const THEME_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isThemeId(value: string): boolean {
  return THEME_ID_PATTERN.test(value);
}
