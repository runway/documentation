# Runway docs style guide

This is the house standard for every page in this repo. CI enforces the mechanical parts; reviewers enforce the rest.

## Page template

Every page, in order:

1. **Frontmatter**: `title` (sentence case, no trailing spaces) and a real `description` (it ships as the SEO meta description — never a placeholder).
2. **What + why**: one short paragraph stating what the feature is and when you'd reach for it, before any procedure.
3. **Procedures** in `<Steps>` components — never bare ordered lists (numbering breaks around images).
4. **Screenshots** in `<Frame>` with descriptive alt text. Never auto-generated alts ("…Pn"), never filenames with employee names or dates in user-visible text.
5. **Platform or path variants** in `<Tabs>` (Mac/Windows, legacy/new, connection method A/B).
6. **FAQ** as `<Accordion>`s at the bottom — this is the house pattern, keep it.
7. **What's next**: up to 3 cross-links.

## Voice

- Second person, active voice, present tense. "Click **Share** to open the share sheet."
- Explain *why* before *how*. A reader should know when to use a feature, not just where the button is.
- No "simply", "just", "easily", "powerful", "seamless".
- Don't substitute support for documentation. "Reach out to your CXM" is a support footer, not an answer.
- US English.

## Terminology

| Use | Never |
|---|---|
| time series | timeseries, time-series |
| driver table block | drivers table block |
| database block | databases block |
| caret | carat |
| vs. | v.s. |
| QuickBooks, HubSpot, Stripe, Excel, Google Sheets | Quickbooks, Hubspot, stripe, excel, google sheets |
| Runway (always capitalized) | runway |

## Linking

- Relative links between docs pages (`/concepts/drivers/drivers-basics`), never absolute `https://docs.runway.com/...`.
- Permissions are stated by linking to the roles matrix in Reference — never restated inline (restated claims drift).
- Never link to Notion, private app URLs, internal org pages, or the old help center.
- Section anchors: verify against the rendered heading; don't hand-encode punctuation.

## Assets

- Screenshots live in `images/<section>/<page>/` with stable descriptive names. No dated CleanShot filenames, nothing at repo root.
- Videos live in `videos/` in this repo and are referenced as `/videos/<name>.mp4`. No external video hosting (no runwaydev, no Loom for load-bearing content).
- Run the orphan check before adding assets (see `scripts/`).

## Truth

- Every behavioral claim is verified against the product or the `runway/runway` code, not a PR title.
- Features behind an active feature flag are not documented.
- Reference pages (functions, shortcuts, roles, integration catalog) are generated — edit the generator inputs, not the page.
