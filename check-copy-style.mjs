import { readdir, readFile } from "node:fs/promises";
import { extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);
const ignoredFiles = new Set(["pnpm-lock.yaml"]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mdx",
  ".mjs",
  ".scss",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const forbiddenPatterns = [
  { label: "literal em dash", pattern: new RegExp(String.fromCodePoint(0x2014), "u") },
  { label: "named HTML em dash entity", pattern: new RegExp("&m" + "dash;", "i") },
  {
    label: "numeric HTML em dash entity",
    pattern: new RegExp("&#" + "(?:0*8212|x0*2014);", "i"),
  },
  {
    label: "Unicode em dash escape",
    pattern: new RegExp("\\\\" + "u(?:0*2014|\\{0*2014\\})", "i"),
  },
  {
    label: "CSS em dash escape",
    pattern: new RegExp("\\\\" + "0*2014(?=[\\s;,.'\"}])", "i"),
  },
];

async function collectTextFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await collectTextFiles(new URL(`${entry.name}/`, directory))));
      }
      continue;
    }
    if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;
    if (textExtensions.has(extname(entry.name).toLowerCase()))
      files.push(new URL(entry.name, directory));
  }
  return files;
}

const violations = [];
for (const file of await collectTextFiles(new URL(".", import.meta.url))) {
  const contents = await readFile(file, "utf8");
  for (const { label, pattern } of forbiddenPatterns) {
    const match = pattern.exec(contents);
    if (!match) continue;
    violations.push({
      file: relative(repositoryRoot, fileURLToPath(file)),
      label,
      line: contents.slice(0, match.index).split("\n").length,
    });
  }
}

if (violations.length > 0) {
  console.error("Copy style check failed. Replace these em dash forms:");
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line} (${violation.label})`);
  }
  process.exitCode = 1;
} else {
  console.log("Copy style check passed: no em dash forms found.");
}
