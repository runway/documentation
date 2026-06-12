# Runway Documentation

This repo contains the Mintlify source for the public Runway docs site at docs.runway.com.

## Local Preview

Run the docs locally from the repo root:

```bash
npx mint dev
```

## Style And Content

Read `STYLE.md` before editing docs. It covers page structure, voice, terminology, links, screenshots, videos, and truth checks.

## Reference Generation

Reference pages for formula functions, keyboard shortcuts, roles, and integrations contain generated blocks. Regenerate a block from a local `runway/runway` checkout with:

```bash
node scripts/generate-references.mjs functions --runway-repo /path/to/runway
node scripts/generate-references.mjs shortcuts --runway-repo /path/to/runway
node scripts/generate-references.mjs roles --runway-repo /path/to/runway
node scripts/generate-references.mjs integrations --runway-repo /path/to/runway
```

To check for drift without writing files, add `--check`.

## Assets

- Put screenshots under `images/<section>/<page>/` with stable descriptive filenames.
- Put videos under `videos/` and reference them as `/videos/<name>.mp4`.
- Do not use dated CleanShot filenames, employee names, or private/internal URLs in public docs.
- Prefer descriptive alt text that explains the screenshot, not the source filename.

## Artifact Sweep

Before opening a PR, run:

```bash
node scripts/sweep-artifacts.mjs --check
```

This catches broken Markdown escapes, generated alt text, forbidden public-docs links, and missing local image/video references.

## Deferred

- Loom embeds in `integrations/data-storage/google-sheets.mdx` should eventually be re-recorded and self-hosted.
