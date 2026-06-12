import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { checkRepository, fixRepository } from "./sweep-artifacts.mjs";

async function withFixture(files, fn) {
  const root = await mkdtemp(join(tmpdir(), "docs-sweep-"));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const fullPath = join(root, path);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, contents);
    }
    await fn(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test("checkRepository reports unsafe markdown and alt artifacts", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "Click \\*\\*Save\\*\\* after reviewing.",
        "Then click **Done **.",
        "![/images/example.png\\+\\_existingInIndexedDbMintlify](/images/example.png)",
        "![Clean Shot2025 08 18at07 58 30 Pn](/images/example.png)",
      ].join("\n"),
      "images/example.png": "",
    },
    async (root) => {
      const result = await checkRepository(root);

      assert.equal(result.ok, false);
      assert.deepEqual(
        result.findings.map((finding) => finding.code),
        [
          "escaped-markdown",
          "escaped-markdown",
          "bold-boundary",
          "escaped-markdown",
          "generated-alt-text",
          "indexeddb-alt-artifact",
          "generated-alt-text",
        ],
      );
    },
  );
});

test("fixRepository applies safe markdown and alt cleanup", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "Click \\*\\*Save \\*\\* and then choose Yes\\!.",
        "![/images/example.png\\+\\_existingInIndexedDbMintlify](/images/example.png)",
      ].join("\n"),
      "images/example.png": "",
    },
    async (root) => {
      const fixResult = await fixRepository(root);
      const checkResult = await checkRepository(root);
      const page = await readFile(join(root, "page.mdx"), "utf8");

      assert.equal(fixResult.changedFiles, 1);
      assert.equal(checkResult.ok, true);
      assert.match(page, /\*\*Save\*\*/);
      assert.match(page, /Yes!/);
      assert.match(page, /!\[Example\]\(\/images\/example\.png\)/);
    },
  );
});

test("checkRepository rejects forbidden domains and missing local assets", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "[Internal](https://www.notion.so/private)",
        '<video src="/videos/missing.mp4" />',
        "![Missing](/images/missing.png)",
      ].join("\n"),
    },
    async (root) => {
      const result = await checkRepository(root);

      assert.equal(result.ok, false);
      assert.deepEqual(
        result.findings.map((finding) => finding.code),
        ["forbidden-domain", "missing-asset", "missing-asset"],
      );
    },
  );
});

test("checkRepository does not flag separate valid bold spans", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "1. Select **Driver charts.**",
        "2. Choose the **drivers** you want to include.",
      ].join("\n"),
    },
    async (root) => {
      const result = await checkRepository(root);

      assert.equal(result.ok, true);
    },
  );
});

test("checkRepository does not flag adjacent valid bold spans on the same line", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "Select your **Sales Team** database and segment by **Name**.",
      ].join("\n"),
    },
    async (root) => {
      const result = await checkRepository(root);

      assert.equal(result.ok, true);
    },
  );
});

test("fixRepository normalizes adjacent bold, code, and title artifacts", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "FX rate "',
        'description: "Example page."',
        "---",
        "",
        "Choose**Add dimension**and then set `Comparison color `and **Default behavior**-**This month**.",
        "Create a c**onsolidated overview** before continuing.",
        "```bash",
        "echo hello",
        "```",
      ].join("\n"),
    },
    async (root) => {
      const fixResult = await fixRepository(root);
      const checkResult = await checkRepository(root);
      const page = await readFile(join(root, "page.mdx"), "utf8");

      assert.equal(fixResult.changedFiles, 1);
      assert.equal(checkResult.ok, true);
      assert.match(page, /title: "FX rate"/);
      assert.match(page, /Choose \*\*Add dimension\*\* and then set `Comparison color` and \*\*Default behavior\*\* - \*\*This month\*\*\./);
      assert.match(page, /Create a \*\*consolidated overview\*\* before continuing\./);
      assert.match(page, /```bash\necho hello\n```/);
    },
  );
});

test("checkRepository reports missing icon labels and frontmatter descriptions", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        "---",
        "",
        "Click the  icon next to the page name.",
      ].join("\n"),
    },
    async (root) => {
      const result = await checkRepository(root);

      assert.equal(result.ok, false);
      assert.deepEqual(
        result.findings.map((finding) => finding.code),
        ["missing-description", "missing-icon-label"],
      );
    },
  );
});

test("checkRepository reports sweep-fixer markdown regressions", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "Open your spreadsheet in **anew tab** and create **aunique range** with **acustom color**.",
        "Create **anexample total** and review **themodel output**.",
        "Keep **any column** and **these formulas cannot be overridden for individual rows.** untouched.",
        "Convert wide data into **along data set**.",
        "- **Google BigQuery**– Uses **GoogleSQL**",
        "- Add a number driver - Name this driver **Rank**.",
        "1. **Create a new database** 2. Set its **source**.",
      ].join("\n"),
    },
    async (root) => {
      const result = await checkRepository(root);

      assert.equal(result.ok, false);
      assert.deepEqual(
        result.findings.map((finding) => finding.code),
        [
          "glued-article-bold",
          "glued-article-bold",
          "glued-article-bold",
          "glued-article-bold",
          "glued-article-bold",
          "glued-article-bold",
          "glued-dash",
          "flattened-list",
          "flattened-list",
        ],
      );
    },
  );
});

test("fixRepository repairs glued article bold without creating new glue", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "It provides clarity with a** human-readable name**.",
        "Open your spreadsheet in **anew tab** and create **aunique range**.",
        "Create **anexample total** and review **themodel output**.",
      ].join("\n"),
    },
    async (root) => {
      const fixResult = await fixRepository(root);
      const checkResult = await checkRepository(root);
      const page = await readFile(join(root, "page.mdx"), "utf8");

      assert.equal(fixResult.changedFiles, 1);
      assert.equal(checkResult.ok, true);
      assert.match(page, /a \*\*human-readable name\*\*/);
      assert.match(page, /a \*\*new tab\*\*/);
      assert.match(page, /a \*\*unique range\*\*/);
      assert.match(page, /an \*\*example total\*\*/);
      assert.match(page, /the \*\*model output\*\*/);
      assert.doesNotMatch(page, /\*\*a(?:new|unique|human)/);
      assert.doesNotMatch(page, /\*\*(?:anexample|themodel)/);
    },
  );
});

test("fixRepository preserves inline code operator tokens", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "Symbols like `+`, `-`, and `>` are operators.",
      ].join("\n"),
    },
    async (root) => {
      const fixResult = await fixRepository(root);
      const checkResult = await checkRepository(root);
      const page = await readFile(join(root, "page.mdx"), "utf8");

      assert.equal(fixResult.changedFiles, 0);
      assert.equal(checkResult.ok, true);
      assert.match(page, /`-`/);
      assert.doesNotMatch(page, /` - `/);
    },
  );
});

test("fixRepository preserves multi-backtick inline code spans", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "- **Code blocks** -> Type triple backticks (```` ``` ````) or triple tildes (`~~~`).",
      ].join("\n"),
    },
    async (root) => {
      const fixResult = await fixRepository(root);
      const checkResult = await checkRepository(root);
      const page = await readFile(join(root, "page.mdx"), "utf8");

      assert.equal(fixResult.changedFiles, 0);
      assert.equal(checkResult.ok, true);
      assert.match(page, /\(```` ``` ````\)/);
      assert.doesNotMatch(page, /````` `` ````/);
    },
  );
});

test("checkRepository ignores hyphens inside inline markup", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "- Name it **Cohort Age - Number** to distinguish it from the dimension.",
      ].join("\n"),
    },
    async (root) => {
      const result = await checkRepository(root);

      assert.equal(result.ok, true);
    },
  );
});

test("checkRepository reports collapsed block starters", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "**After creating a database, configure it.** 1. Click the header.",
        "## **SQL-powered integration** 1. Click **Setup**.",
        "### **General formulas** Even outside integrations, this applies.",
        "**Check the results:** - Rank 1 should be first - Rank 2 should be second",
      ].join("\n"),
    },
    async (root) => {
      const result = await checkRepository(root);

      assert.equal(result.ok, false);
      assert.deepEqual(
        result.findings.map((finding) => finding.code),
        ["flattened-list", "flattened-list", "flattened-list", "flattened-list"],
      );
    },
  );
});

test("fixRepository repairs possessive bold splits", async () => {
  await withFixture(
    {
      "page.mdx": [
        "---",
        'title: "Example"',
        'description: "Example page."',
        "---",
        "",
        "Filters evaluate based on **this month’** svalues.",
      ].join("\n"),
    },
    async (root) => {
      const redResult = await checkRepository(root);
      const fixResult = await fixRepository(root);
      const checkResult = await checkRepository(root);
      const page = await readFile(join(root, "page.mdx"), "utf8");

      assert.equal(redResult.ok, false);
      assert.deepEqual(
        redResult.findings.map((finding) => finding.code),
        ["bold-possessive-boundary"],
      );
      assert.equal(fixResult.changedFiles, 1);
      assert.equal(checkResult.ok, true);
      assert.match(page, /\*\*this month’s\*\* values/);
    },
  );
});
