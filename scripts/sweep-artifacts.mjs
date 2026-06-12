#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const MDX_ONLY_EXTENSIONS = new Set([".mdx"]);
const SKIP_DIRS = new Set([".git", "node_modules", ".next", ".mintlify"]);
const EXTRA_REFERENCE_FILES = new Set(["docs.json", "inkeep.js"]);
const FORBIDDEN_DOMAIN_PATTERN =
  /documentation\.runwaydev\.com|notion\.so|help\.runway\.com/g;

function normalizePath(path) {
  return path.replace(/\\/g, "");
}

function displayPath(root, filePath) {
  return relative(root, filePath) || basename(filePath);
}

function humanizeAssetPath(src) {
  const cleanSrc = decodeURIComponent(normalizePath(src));
  const extension = extname(cleanSrc);
  const stem = basename(cleanSrc, extension)
    .replace(/@2x/gi, "")
    .replace(/\(\d+\)/g, "")
    .replace(/^CleanShot\d{4}[-]?\d{2}[-]?\d{2}.*$/i, "screenshot")
    .replace(/^Clean Shot\s*\d{4}.*$/i, "screenshot")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parent = basename(dirname(cleanSrc)).replace(/[_-]+/g, " ").trim();
  const text = stem && stem !== "screenshot" ? stem : parent || "screenshot";

  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z]{2,}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function isGeneratedAltText(alt) {
  const value = alt.trim();
  return (
    value.length === 0 ||
    value.includes("existingInIndexedDbMintlify") ||
    /(?:^|\/)images\//.test(value) ||
    /\.(png|jpe?g|gif|webp|mp4)$/i.test(value) ||
    /clean ?shot\s*\d{4}/i.test(value) ||
    /\b(?:Pn|Gi|Web)\b$/.test(value)
  );
}

function findLine(contents, index) {
  return contents.slice(0, index).split("\n").length;
}

function addFinding(findings, root, filePath, contents, index, code, message) {
  findings.push({
    code,
    file: displayPath(root, filePath),
    line: findLine(contents, index),
    message,
  });
}

async function walkFiles(root) {
  const files = [];

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(join(dir, entry.name));
        }
        continue;
      }

      if (entry.isFile()) {
        const filePath = join(dir, entry.name);
        if (MDX_ONLY_EXTENSIONS.has(extname(entry.name)) || EXTRA_REFERENCE_FILES.has(relative(root, filePath))) {
          files.push(filePath);
        }
      }
    }
  }

  await walk(root);
  return files.sort();
}

function checkMarkdownArtifacts(root, filePath, contents, findings) {
  const artifactPatterns = [
    {
      code: "escaped-markdown",
      message: "Literal escaped markdown marker found.",
      pattern: /\\\*\\\*|\\!|\\\+|\\_[^_\n]+\\_/g,
    },
  ];

  for (const { code, message, pattern } of artifactPatterns) {
    for (const match of contents.matchAll(pattern)) {
      addFinding(findings, root, filePath, contents, match.index ?? 0, code, message);
    }
  }

  const boldSpanPattern = /\*\*([^*\n]+)\*\*/g;
  for (const match of contents.matchAll(boldSpanPattern)) {
    const text = match[1];
    const index = match.index ?? 0;
    const end = index + match[0].length;
    if (/^[ \t]|[ \t]$/.test(text)) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        index,
        "bold-boundary",
        "Bold marker has a space inside the boundary.",
      );
    }
    if (/[A-Za-z0-9)\].,;:!?-]$/.test(contents.slice(0, index))) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        index,
        "bold-adjacent-text",
        "Bold marker is adjacent to preceding text or punctuation.",
      );
    }
    if (/^[A-Za-z0-9(`-]/.test(contents.slice(end))) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        index,
        "bold-adjacent-text",
        "Bold marker is adjacent to following text or punctuation.",
      );
    }
  }

  const inlineCodePattern = /`([^`\n]+)`/g;
  for (const match of contents.matchAll(inlineCodePattern)) {
    const text = match[1];
    const index = match.index ?? 0;
    const end = index + match[0].length;
    if (contents[index - 1] === "`" || contents[end] === "`") {
      continue;
    }
    if (/^[ \t]|[ \t]$/.test(text)) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        index,
        "code-boundary",
        "Inline code marker has a space inside the boundary.",
      );
    }
    if (/^[A-Za-z0-9(]/.test(contents.slice(end))) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        index,
        "code-adjacent-text",
        "Inline code marker is adjacent to following text.",
      );
    }
  }

  const missingIconPattern = /\b(?:click|Click) the {2,}(?:icon|button)\b/g;
  for (const match of contents.matchAll(missingIconPattern)) {
    addFinding(
      findings,
      root,
      filePath,
      contents,
      match.index ?? 0,
      "missing-icon-label",
      "Instruction is missing an icon label.",
    );
  }

  const frontmatter = contents.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatter) {
    const titleMatch = frontmatter[1].match(/^title:\s*(["'])(.*?[ \t])\1\s*$/m);
    if (titleMatch) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        frontmatter.index ?? 0,
        "frontmatter-title-space",
        "Frontmatter title has trailing space.",
      );
    }
    const descriptionMatch = frontmatter[1].match(/^description:\s*(["'])(.*?)\1\s*$/m);
    if (!descriptionMatch) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        frontmatter.index ?? 0,
        "missing-description",
        "Frontmatter description is missing.",
      );
    } else if (descriptionMatch[2].includes("Description of your new file.")) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        frontmatter.index ?? 0,
        "placeholder-description",
        "Frontmatter description still contains placeholder copy.",
      );
    }
  }

  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  for (const match of contents.matchAll(imagePattern)) {
    const alt = match[1];
    const index = match.index ?? 0;
    if (alt.includes("existingInIndexedDbMintlify")) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        index,
        "indexeddb-alt-artifact",
        "Image alt text contains existingInIndexedDbMintlify.",
      );
    }
    if (isGeneratedAltText(alt)) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        index,
        "generated-alt-text",
        "Image alt text appears to be generated from a filename.",
      );
    }
  }
}

function checkForbiddenDomains(root, filePath, contents, findings) {
  for (const match of contents.matchAll(FORBIDDEN_DOMAIN_PATTERN)) {
    addFinding(
      findings,
      root,
      filePath,
      contents,
      match.index ?? 0,
      "forbidden-domain",
      `Forbidden public-docs domain found: ${match[0]}.`,
    );
  }
}

function checkLocalAssets(root, filePath, contents, findings) {
  const assetPattern =
    /(?:src=["']|]\()(?<asset>\/(?:images|videos)\/[^"')\s]+)(?:["']|\))/g;

  for (const match of contents.matchAll(assetPattern)) {
    const asset = normalizePath(match.groups?.asset ?? "");
    const diskPath = join(root, asset.slice(1));
    if (!existsSync(diskPath)) {
      addFinding(
        findings,
        root,
        filePath,
        contents,
        match.index ?? 0,
        "missing-asset",
        `Referenced asset does not exist: ${asset}.`,
      );
    }
  }
}

function shouldSpaceBeforeMarkup(char) {
  return /[A-Za-z0-9)\].,;:!?]/.test(char ?? "");
}

function shouldSpaceAfterMarkup(char) {
  return /[A-Za-z0-9(`]/.test(char ?? "");
}

function normalizeInlineMarkup(contents) {
  let fixed = "";
  let index = 0;

  while (index < contents.length) {
    if (contents.startsWith("```", index)) {
      fixed += "```";
      index += 3;
      continue;
    }

    if (contents[index] === "`") {
      const close = contents.indexOf("`", index + 1);
      if (close !== -1) {
        const text = contents.slice(index + 1, close);
        if (!text.includes("\n")) {
          fixed += `\`${text.trim()}\``;
          index = close + 1;
          if (shouldSpaceAfterMarkup(contents[index])) {
            fixed += " ";
          }
          continue;
        }
      }
    }

    if (contents.startsWith("**", index)) {
      const close = contents.indexOf("**", index + 2);
      if (close !== -1) {
        const rawText = contents.slice(index + 2, close);
        if (!rawText.includes("\n")) {
          let text = rawText.trim();
          const previousWord = fixed.match(/[A-Za-z]+$/)?.[0] ?? "";
          if (previousWord.length === 1 && /^[a-z]/.test(text)) {
            const previousChar = previousWord;
            fixed = fixed.slice(0, -1);
            text = `${previousChar}${text}`;
          } else if (shouldSpaceBeforeMarkup(fixed.at(-1) ?? "")) {
            fixed += " ";
          }

          fixed += `**${text}**`;
          index = close + 2;

          const nextChar = contents[index];
          if (nextChar === "-" || nextChar === "→" || nextChar === "—") {
            fixed += ` ${nextChar} `;
            index += 1;
            while (contents[index] === " " || contents[index] === "\t") {
              index += 1;
            }
          } else if (shouldSpaceAfterMarkup(nextChar)) {
            fixed += " ";
          }
          continue;
        }
      }
    }

    fixed += contents[index];
    index += 1;
  }

  return fixed.replace(/[ \t]+$/gm, "");
}

export async function checkRepository(root = process.cwd()) {
  const findings = [];
  const files = await walkFiles(root);

  for (const filePath of files) {
    const contents = await readFile(filePath, "utf8");
    if (MDX_ONLY_EXTENSIONS.has(extname(filePath))) {
      checkMarkdownArtifacts(root, filePath, contents, findings);
    }
    checkForbiddenDomains(root, filePath, contents, findings);
    checkLocalAssets(root, filePath, contents, findings);
  }

  findings.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.code.localeCompare(b.code);
  });

  return { findings, ok: findings.length === 0 };
}

function fixMarkdown(contents) {
  let fixed = contents;

  fixed = fixed
    .replace(/\\\*\\\*/g, "**")
    .replace(/\\{1,}!/g, "!")
    .replace(/\\\+/g, "+")
    .replace(/\\_([^_\n]+?)\\_/g, "_$1_");

  fixed = normalizeInlineMarkup(fixed);

  fixed = fixed.replace(/^---\n([\s\S]*?)\n---/, (match, frontmatter) => {
    const normalizedFrontmatter = frontmatter.replace(
      /^(title:\s*["'])([^"']*?)[ \t](["']\s*)$/m,
      "$1$2$3",
    );
    return `---\n${normalizedFrontmatter}\n---`;
  });

  fixed = fixed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    if (!isGeneratedAltText(alt)) return match;
    return `![${humanizeAssetPath(src)}](${src})`;
  });

  return fixed;
}

export async function fixRepository(root = process.cwd()) {
  let changedFiles = 0;
  const files = await walkFiles(root);

  for (const filePath of files) {
    if (!MDX_ONLY_EXTENSIONS.has(extname(filePath))) continue;

    const contents = await readFile(filePath, "utf8");
    const fixed = fixMarkdown(contents);
    if (fixed !== contents) {
      await writeFile(filePath, fixed);
      changedFiles += 1;
    }
  }

  return { changedFiles };
}

function printFindings(findings) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.code}: ${finding.message}`);
  }
}

async function main() {
  const root = process.cwd();
  const shouldFix = process.argv.includes("--fix");
  const shouldCheck = process.argv.includes("--check") || !shouldFix;

  if (shouldFix) {
    const result = await fixRepository(root);
    console.log(`sweep-artifacts: updated ${result.changedFiles} file(s).`);
  }

  if (shouldCheck) {
    const result = await checkRepository(root);
    if (!result.ok) {
      printFindings(result.findings);
      process.exitCode = 1;
      return;
    }
    console.log("sweep-artifacts: no artifacts found.");
  }
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFilePath) {
  await main();
}
