import { readFile } from "node:fs/promises";
import {
  ADAPTER_REGION_KEYS,
  type AdapterPageState,
  type AdapterProbe,
  type AdapterRegion,
  type DoubaoAdapter
} from "../shared/contracts";

export type AdapterValidationResult =
  | { ok: true; adapter: DoubaoAdapter }
  | { ok: false; errors: string[] };

const REGION_SET = new Set<string>(ADAPTER_REGION_KEYS);
const PAGE_STATES: AdapterPageState[] = ["chat", "settings"];
const FORBIDDEN_TARGET_PARTS = ["doubao-background", "cross-site-support", "login"];

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function validateAdapter(input: unknown): AdapterValidationResult {
  const errors: string[] = [];
  const source = object(input);
  if (!source) return { ok: false, errors: ["Adapter must be an object"] };
  if (source.adapterVersion !== 1) errors.push("adapterVersion must be 1");

  const targets: DoubaoAdapter["targets"] = [];
  if (!Array.isArray(source.targets) || source.targets.length === 0) {
    errors.push("targets must be a non-empty array");
  } else {
    for (const value of source.targets) {
      const target = object(value);
      if (!target || (target.kind !== "main" && target.kind !== "settings")) {
        errors.push("target kind must be main or settings");
        continue;
      }
      if (typeof target.urlPrefix !== "string" || !target.urlPrefix.startsWith("doubao://") || target.urlPrefix.length > 256) {
        errors.push("target urlPrefix must be a Doubao URL");
        continue;
      }
      targets.push({ kind: target.kind, urlPrefix: target.urlPrefix });
    }
  }

  const regionInput = object(source.regions);
  const regions = {} as DoubaoAdapter["regions"];
  if (!regionInput) {
    errors.push("regions must be an object");
  } else {
    for (const key of Object.keys(regionInput)) {
      if (!REGION_SET.has(key)) errors.push(`Unknown adapter region: ${key}`);
    }
  }
  for (const key of ADAPTER_REGION_KEYS) {
    const selectors = regionInput?.[key];
    if (!Array.isArray(selectors) || selectors.some((selector) => typeof selector !== "string" || selector.trim().length === 0 || selector.length > 512) || selectors.length > 8) {
      errors.push(`regions.${key} must be an array of at most 8 selectors`);
      regions[key] = [];
    } else {
      regions[key] = selectors.map((selector) => (selector as string).trim());
    }
  }

  const pageStateInput = object(source.pageStates);
  const pageStates = {} as DoubaoAdapter["pageStates"];
  if (!pageStateInput) {
    errors.push("pageStates must be an object");
  } else {
    for (const key of Object.keys(pageStateInput)) {
      if (!PAGE_STATES.includes(key as AdapterPageState)) errors.push(`Unknown page state: ${key}`);
    }
  }
  for (const state of PAGE_STATES) {
    const stateInput = object(pageStateInput?.[state]);
    const required = stateInput?.requiredRegions;
    if (!Array.isArray(required) || required.length === 0 || required.some((key) => typeof key !== "string" || !REGION_SET.has(key))) {
      errors.push(`pageStates.${state}.requiredRegions is invalid`);
      pageStates[state] = { requiredRegions: [] };
    } else {
      pageStates[state] = { requiredRegions: [...new Set(required)] as AdapterRegion[] };
    }
  }

  const adapter: DoubaoAdapter = { adapterVersion: 1, targets, regions, pageStates };
  return errors.length === 0 ? { ok: true, adapter } : { ok: false, errors };
}

export class AdapterStore {
  constructor(
    private readonly userPath: string,
    private readonly packagedPath: string
  ) {}

  async load(): Promise<DoubaoAdapter> {
    let path = this.userPath;
    let json: string;
    try {
      json = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      path = this.packagedPath;
      json = await readFile(path, "utf8");
    }
    let input: unknown;
    try { input = JSON.parse(json); } catch { throw new Error(`Adapter JSON is invalid: ${path}`); }
    const result = validateAdapter(input);
    if (!result.ok) throw new Error(`Adapter is invalid: ${result.errors.join("; ")}`);
    return result.adapter;
  }
}

export function isAllowedTarget(url: string, adapter: DoubaoAdapter): boolean {
  const normalized = url.toLowerCase();
  if (!normalized.startsWith("doubao://") || FORBIDDEN_TARGET_PARTS.some((part) => normalized.includes(part))) {
    return false;
  }
  return adapter.targets.some((target) => url.startsWith(target.urlPrefix));
}

export function probePage(
  queryCount: (selector: string) => number,
  adapter: DoubaoAdapter,
  pageState: AdapterPageState
): AdapterProbe {
  const matches: AdapterProbe["matches"] = {};
  for (const region of ADAPTER_REGION_KEYS) {
    for (const selector of adapter.regions[region]) {
      let count = 0;
      try { count = queryCount(selector); } catch { count = 0; }
      if (count > 0) {
        matches[region] = { selector, count };
        break;
      }
    }
  }
  const required = new Set(adapter.pageStates[pageState].requiredRegions);
  const missingRequired = [...required].filter((region) => !matches[region]);
  const missingOptional = ADAPTER_REGION_KEYS.filter((region) =>
    !required.has(region) && adapter.regions[region].length > 0 && !matches[region]
  );
  return {
    status: missingRequired.length > 0 ? "incompatible" : missingOptional.length > 0 ? "partial" : "compatible",
    matches,
    missingRequired,
    missingOptional
  };
}
