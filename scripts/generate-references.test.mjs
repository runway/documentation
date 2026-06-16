import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  applyFormulaDescriptionRenderFixes,
  checkGeneratedBlock,
  extractShortcuts,
  parseRunwayNativeCatalog,
  parseProviderHandlerIntegration,
  replaceGeneratedBlock,
} from "./generate-references.mjs";

const execFileAsync = promisify(execFile);
const generateReferencesPath = fileURLToPath(new URL("./generate-references.mjs", import.meta.url));

async function writeFixtureFile(root, relativePath, contents) {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents);
}

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

test("applyFormulaDescriptionRenderFixes corrects product-source typos", () => {
  const source =
    "Returns net work days exclusing holidays and weekends. The first character represents Monday (default is '0000077').";

  assert.equal(
    applyFormulaDescriptionRenderFixes(source),
    "Returns net work days excluding holidays and weekends. The first character represents Monday (default is '0000011').",
  );
});

test("parseRunwayNativeCatalog tolerates whitespace around catalog anchors", () => {
  const source = [
    'const fileUploadSlug = "file-upload"',
    "xeroIntegration     = func() openapi_models.Integration {",
    "  return openapi_models.Integration{}",
    "}",
  ].join("\n");

  assert.deepEqual(parseRunwayNativeCatalog(source), [
    {
      slug: "file-upload",
      categoryKey: "filestorage",
      name: "CSV / Raw File Upload",
      route: "native",
      sourceKey: "FILE_UPLOAD",
    },
    {
      slug: "xero",
      categoryKey: "accounting",
      name: "Xero",
      route: "native",
      sourceKey: "RUNWAY_XERO",
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

test("integrations check rejects partial Merge generated catalog parses", async (t) => {
  const productRoot = await mkdtemp(join(tmpdir(), "docs-generate-references-product-"));
  t.after(() => rm(productRoot, { force: true, recursive: true }));

  const workatoSources = Array.from(
    { length: 20 },
    (_, index) => `  [ExtStaticSource.WorkatoSource${index}]: 'workato-source-${index}',`,
  ).join("\n");

  await Promise.all([
    writeFixtureFile(
      productRoot,
      "go/apisvc/integrations/providers/merge/catalog/catalog_gen.go",
      [
        "package catalog",
        "",
        "var generatedCatalog = []openapi_models.Integration{",
        "\tfunc() openapi_models.Integration {",
        '\t\tintegration := openapi_models.NewIntegration(openapi_models.INTEGRATIONPROVIDER_MERGE, "adp-workforce-now", openapi_models.INTEGRATIONCATEGORY_HRIS, "ADP Workforce Now")',
        "\t\treturn *integration",
        "\t}(),",
        "\tfunc() openapi_models.Integration {",
        '\t\tintegration := openapi_models.NewIntegration(openapi_models.INTEGRATIONPROVIDER_MERGE, "bamboohr", openapi_models.INTEGRATIONCATEGORY_HRIS)',
        "\t\treturn *integration",
        "\t}(),",
        "}",
      ].join("\n"),
    ),
    writeFixtureFile(
      productRoot,
      "go/apisvc/integrations/providers/fivetran/catalog/catalog_gen.go",
      [
        "package catalog",
        "",
        "var generatedCatalog = []openapi_models.Integration{",
        "\tfunc() openapi_models.Integration {",
        '\t\tintegration := openapi_models.NewIntegration(openapi_models.INTEGRATIONPROVIDER_FIVETRAN, "xero", openapi_models.INTEGRATIONCATEGORY_ACCOUNTING, "Xero (Fivetran)")',
        "\t\treturn *integration",
        "\t}(),",
        "}",
      ].join("\n"),
    ),
    writeFixtureFile(
      productRoot,
      "go/apisvc/integrations/providers/runway/provider.go",
      [
        'const fileUploadSlug = "file-upload"',
        "",
        "var xeroIntegration = func() openapi_models.Integration {",
        "\treturn openapi_models.Integration{}",
        "}",
      ].join("\n"),
    ),
    writeFixtureFile(
      productRoot,
      "go/apisvc/integrations/providers/rippling/provider.go",
      ['const ripplingSlug = "rippling"', 'const ripplingDisplayName = "Rippling"'].join("\n"),
    ),
    writeFixtureFile(
      productRoot,
      "go/api-server/app/handlers/integrations/internal/providers/puzzle/puzzle.go",
      [
        'const PuzzleIntegrationSlug = "puzzle"',
        'const PuzzleIntegrationName = "Puzzle"',
        "",
        "var integration = &modelv2.Integration{",
        "\tName: PuzzleIntegrationName,",
        "\tSlug: PuzzleIntegrationSlug,",
        "\tCategories: []modelv2.IntegrationCategory{",
        "\t\tmodelv2.IntegrationCategoryAccounting,",
        "\t},",
        "}",
      ].join("\n"),
    ),
    writeFixtureFile(
      productRoot,
      "go/api-server/app/handlers/integrations/internal/providers/runway_api/runway_api.go",
      [
        "var integration = &modelv2.Integration{",
        '\tName: "Runway API",',
        '\tSlug: "runway-api",',
        "\tCategories: []modelv2.IntegrationCategory{",
        "\t\tmodelv2.IntegrationCategoryAccounting,",
        "\t},",
        "}",
      ].join("\n"),
    ),
    writeFixtureFile(
      productRoot,
      "webapp/src/helpers/integrations.ts",
      ["export const EXT_DRIVER_SOURCE_TO_SLUG = {", workatoSources, "};"].join("\n"),
    ),
  ]);

  let error;
  try {
    await execFileAsync(process.execPath, [
      generateReferencesPath,
      "integrations",
      "--runway-repo",
      productRoot,
      "--check",
    ]);
  } catch (caught) {
    error = caught;
  }

  assert.ok(error);
  assert.match(
    error.stderr,
    /Parsed 1 Merge generated catalog entries but found 2 openapi_models\.NewIntegration markers/,
  );
});
