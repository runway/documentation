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
