import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dark mode inline code has readable text and surface colors", async () => {
  const css = await readFile(new URL("../styles/docs.css", import.meta.url), "utf8");
  const darkInlineCodeRule =
    /\.dark\s+\.prose\s+:where\(code\):not\(:where\(\[class~='not-prose'\], \[class~='not-prose'\] \*\)\)\s*\{(?<body>[^}]+)\}/;
  const match = css.match(darkInlineCodeRule);

  assert.ok(match?.groups?.body, "Expected a dark-mode inline code override.");
  assert.match(
    match.groups.body,
    /color:\s*rgb\(var\(--gray-50\)\)/,
    "Dark inline code text should use a light token.",
  );
  assert.match(
    match.groups.body,
    /background-color:\s*rgba\(var\(--gray-800\) \/ 0\.55\)/,
    "Dark inline code should sit on a visible dark surface.",
  );
});
