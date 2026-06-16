import type { Tool } from "ai";
import { utilityTools } from "./tools/utility";
import { webTools } from "./tools/web";
import { storageTools } from "./tools/storage";
import { emailTools } from "./tools/email";
import { dateTools } from "./tools/datetime";
import { textTools } from "./tools/text";
import { extraTools } from "./tools/extras";
import { imageTools } from "./tools/image";
import { workerTools } from "./tools/workers";
import { financeTools } from "./tools/finance";
import { documentTools } from "./tools/documents";
import { schedulingTools } from "./tools/scheduling";

/**
 * Tool registry & plugin hook (S11).
 *
 * Tools are grouped into category modules. The registry composes them and
 * exposes a `registerTool` hook so external plugins (or future per-package
 * tools) can add capabilities without editing the agent. A category-keyed map
 * also enables lazy/selective loading and tooling like the /admin/tools page.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;
export type ToolMap = Record<string, AnyTool>;

/** Built-in tools grouped by category (lazy-friendly: each is a plain object). */
export const toolCategories: Record<string, ToolMap> = {
  utility: utilityTools,
  web: webTools,
  storage: storageTools,
  email: emailTools,
  datetime: dateTools,
  text: textTools,
  extras: extraTools,
  image: imageTools,
  workers: workerTools,
  finance: financeTools,
  documents: documentTools,
  scheduling: schedulingTools,
};

/**
 * Per-request feature flags toggled from the UI (composer toggles). Default to
 * the always-on baseline; web/image/workers categories are gated by these.
 */
export interface FeatureFlags {
  webSearch: boolean;
  imageGen: boolean;
  workers: boolean;
}

export const DEFAULT_FEATURES: FeatureFlags = {
  webSearch: true,
  imageGen: false,
  workers: true,
};

// Categories that are always available regardless of feature flags.
const ALWAYS_ON = [
  "utility",
  "storage",
  "email",
  "datetime",
  "text",
  "extras",
  "finance",
  "documents",
  "scheduling",
];

// Plugin-registered tools (populated via registerTool at startup).
const pluginTools: ToolMap = {};

/**
 * Compose the tool set for a request given its feature flags. Feature-gated
 * categories (web/image/workers) are only included when their flag is on, so
 * the model never sees — and cannot call — a disabled capability.
 */
export function getToolsForFeatures(
  features: Partial<FeatureFlags> = {}
): ToolMap {
  const f = { ...DEFAULT_FEATURES, ...features };
  const maps: ToolMap[] = ALWAYS_ON.map((c) => toolCategories[c]);
  if (f.webSearch) maps.push(toolCategories.web);
  if (f.imageGen) maps.push(toolCategories.image);
  if (f.workers) maps.push(toolCategories.workers);
  return Object.assign({}, ...maps, pluginTools) as ToolMap;
}

/**
 * Register an external tool by name. Throws on name collision so plugins can't
 * silently shadow a built-in. Call this during server startup before the agent
 * handles its first request.
 */
export function registerTool(name: string, tool: AnyTool): void {
  if (name in getBuiltInTools() || name in pluginTools) {
    throw new Error(`registerTool: a tool named "${name}" is already registered.`);
  }
  pluginTools[name] = tool;
}

/** Register many tools at once. */
export function registerTools(tools: ToolMap): void {
  for (const [name, tool] of Object.entries(tools)) registerTool(name, tool);
}

function getBuiltInTools(): ToolMap {
  return Object.assign({}, ...Object.values(toolCategories)) as ToolMap;
}

/** The full composed tool set (built-ins + plugins). */
export function getAllTools(): ToolMap {
  return { ...getBuiltInTools(), ...pluginTools };
}

/** A serializable manifest of tool names grouped by category (S8). */
export function getToolManifest(): {
  categories: Record<string, string[]>;
  plugins: string[];
  total: number;
} {
  const categories: Record<string, string[]> = {};
  for (const [cat, map] of Object.entries(toolCategories)) {
    categories[cat] = Object.keys(map).sort();
  }
  const plugins = Object.keys(pluginTools).sort();
  const total =
    Object.values(categories).reduce((n, arr) => n + arr.length, 0) +
    plugins.length;
  return { categories, plugins, total };
}
