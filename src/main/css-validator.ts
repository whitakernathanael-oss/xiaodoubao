import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import { isThemeId } from "../shared/contracts";

export type CssValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

const ALLOWED_AT_RULES = new Set(["media", "supports"]);

function unsafeValue(value: string): boolean {
  const normalized = value.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
  return normalized.includes("\\")
    || ["url(", "expression(", "behavior:", "-moz-binding"].some((token) => normalized.includes(token));
}

function selectorIsScoped(selector: string, themeId: string): boolean {
  let valid = true;
  selectorParser((root) => {
    root.each((item) => {
      let hasRoot = false;
      let hasSkinClass = false;
      let hasThemeClass = false;
      for (const node of item.nodes) {
        if (node.type === "combinator") break;
        if (node.type === "tag" && node.value.toLowerCase() === "html") hasRoot = true;
        if (node.type === "pseudo" && node.value.toLowerCase() === ":root") hasRoot = true;
        if (node.type === "class" && node.value === "doubao-skin") hasSkinClass = true;
        if (node.type === "class" && node.value === `theme-${themeId}`) hasThemeClass = true;
      }
      if (!(hasRoot && hasSkinClass && hasThemeClass)) valid = false;
    });
  }).processSync(selector);
  return valid;
}

export function validateExtraCss(css: string, themeId: string): CssValidationResult {
  const errors = new Set<string>();
  if (!isThemeId(themeId)) return { ok: false, errors: ["Theme id is invalid"] };
  if (css.length > 100 * 1024) return { ok: false, errors: ["CSS exceeds 100 KB"] };

  try {
    const root = postcss.parse(css);
    root.walkAtRules((rule) => {
      if (!ALLOWED_AT_RULES.has(rule.name.toLowerCase())) {
        errors.add(`@${rule.name} is not allowed`);
      }
      if (unsafeValue(rule.params)) errors.add(`Unsafe value in @${rule.name}`);
    });
    root.walkRules((rule) => {
      try {
        if (!selectorIsScoped(rule.selector, themeId)) {
          errors.add(`Selector is outside theme scope: ${rule.selector}`);
        }
      } catch {
        errors.add(`Selector is invalid: ${rule.selector}`);
      }
    });
    root.walkDecls((declaration) => {
      if (declaration.parent?.type !== "rule") errors.add("Declarations must be inside a scoped rule");
      const property = declaration.prop.trim().toLowerCase();
      if (property === "behavior" || property === "-moz-binding") {
        errors.add(`Property ${property} is not allowed`);
      }
      if (unsafeValue(declaration.value)) {
        errors.add(`Unsafe value in ${property}`);
      }
    });
  } catch (error) {
    errors.add(error instanceof Error ? error.message : "CSS is invalid");
  }

  return errors.size === 0 ? { ok: true } : { ok: false, errors: [...errors] };
}
