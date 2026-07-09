import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sidebar svg rules do not paint icon backgrounds", async () => {
  const css = await readFile(new URL("../styles/nav.css", import.meta.url), "utf8");
  const sidebarSvgBackgroundRule =
    /#sidebar[^{]*svg[^{]*\{[^}]*background(?:-color)?\s*:/;

  assert.equal(
    sidebarSvgBackgroundRule.test(css),
    false,
    "Sidebar SVG backgrounds render as shaded blocks around Mintlify nav icons and chevrons.",
  );
});
