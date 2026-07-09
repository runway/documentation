import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TEXT_ONLY_NAV_PAGES = [
  "ai/data-and-privacy.mdx",
  "domain-migration.mdx",
];

function frontmatterFor(contents) {
  return contents.match(/^---\n(?<frontmatter>[\s\S]*?)\n---/)?.groups?.frontmatter ?? "";
}

test("standalone nav pages remain text-only without sidebar icons", async () => {
  for (const page of TEXT_ONLY_NAV_PAGES) {
    const contents = await readFile(new URL(`../${page}`, import.meta.url), "utf8");

    assert.doesNotMatch(
      frontmatterFor(contents),
      /^icon:/m,
      `${page} should not set a sidebar icon.`,
    );
  }
});
