import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkGeneratedBlock,
  extractShortcuts,
  parseProviderHandlerIntegration,
  replaceGeneratedBlock,
} from "./generate-references.mjs";

test("replaceGeneratedBlock rewrites only the named marker block", () => {
  const page = [
    "Intro copy stays.",
    "",
    "{/* GENERATED:functions START */}",
    "old generated content",
    "{/* GENERATED:functions END */}",
    "",
    "Closing copy stays.",
  ].join("\n");

  const updated = replaceGeneratedBlock(page, "functions", "new generated content\n");

  assert.equal(
    updated,
    [
      "Intro copy stays.",
      "",
      "{/* GENERATED:functions START */}",
      "new generated content",
      "{/* GENERATED:functions END */}",
      "",
      "Closing copy stays.",
    ].join("\n"),
  );
});

test("checkGeneratedBlock reports drift without changing the page", async (t) => {
  const testDir = await mkdtemp(join(tmpdir(), "docs-generate-references-"));
  t.after(() => rm(testDir, { force: true, recursive: true }));
  const pagePath = join(testDir, "page.mdx");
  const original = [
    "{/* GENERATED:shortcuts START */}",
    "old",
    "{/* GENERATED:shortcuts END */}",
    "",
  ].join("\n");
  await writeFile(pagePath, original);

  const result = await checkGeneratedBlock(pagePath, "shortcuts", "new\n");
  const after = await readFile(pagePath, "utf8");

  assert.equal(result.ok, false);
  assert.match(result.message, /drift/i);
  assert.equal(after, original);
});

test("extractShortcuts preserves registry order and renders platform labels", () => {
  const source = [
    "export const KEYBOARD_SHORTCUTS: Record<string, ShortcutEntry> = {",
    "  search: getKeyboardShortcut('K', { meta: true }),",
    "  redoWindows: getKeyboardShortcut('Y', { ctrl: true }),",
    "  delete: getKeyboardShortcut('⌫'),",
    "};",
  ].join("\n");

  assert.deepEqual(extractShortcuts(source), [
    {
      key: "search",
      mac: "⌘ K",
      windows: "Ctrl+K",
      hotkeys: "Cmd+K, Ctrl+K",
    },
    {
      key: "redoWindows",
      mac: "⌃ Y",
      windows: "Ctrl+Y",
      hotkeys: "Ctrl+Y",
    },
    {
      key: "delete",
      mac: "⌫",
      windows: "⌫",
      hotkeys: "Backspace, Delete",
    },
  ]);
});

test("parseProviderHandlerIntegration extracts offered provider-specific rows", () => {
  const source = [
    'const CustomIntegrationSlug = "custom-source"',
    'const CustomIntegrationName = "Custom Source"',
    "",
    "var integration = &modelv2.Integration{",
    "  Name:     CustomIntegrationName,",
    "  Slug:     CustomIntegrationSlug,",
    "  Provider: modelv2.IntegrationProviderCustom,",
    "  Categories: []modelv2.IntegrationCategory{",
    "    modelv2.IntegrationCategoryAccounting,",
    "  },",
    "}",
  ].join("\n");

  assert.deepEqual(parseProviderHandlerIntegration(source, { sourceKey: "CUSTOM_SOURCE" }), {
    slug: "custom-source",
    categoryKey: "accounting",
    name: "Custom Source",
    route: "native",
    sourceKey: "CUSTOM_SOURCE",
  });
});
