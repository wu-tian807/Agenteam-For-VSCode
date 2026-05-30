/**
 * @desc Auto-version: derive version from latest git tag + commit count.
 *
 * Convention:
 *   - Tag v<major>.<minor>.<patch> (e.g. v0.1.0) sets the base version
 *   - Each commit after tag increments the 4th number: 0.1.0.1, 0.1.0.2, ...
 *   - On the tagged commit itself, version = 0.1.0 (no 4th number)
 *
 * Usage:
 *   node scripts/auto-version.js          # print version to stdout
 *   node scripts/auto-version.js --apply  # update package.json + print
 *
 * This follows the same pattern used by many mature VSCode extensions
 * (e.g. vscode-go, vscode-eslint) and mirrors VS Code's own OSS build.
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PKG_PATH = path.join(ROOT, "package.json");

function git(...args) {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

/** Resolve base version from latest tag, fallback to package.json. */
function resolveBaseVersion() {
  // Try tag first: v0.1.0 → 0.1.0
  const tag = git("describe", "--tags", "--abbrev=0");
  if (tag) {
    const ver = tag.replace(/^v/, "");
    if (/^\d+\.\d+\.\d+$/.test(ver)) return ver;
  }
  // Fallback: read from package.json
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Count commits since the given tag. */
function commitCountSince(tag) {
  if (!tag) return null;
  const count = git("rev-list", "--count", `${tag}..HEAD`);
  return count !== null ? parseInt(count, 10) : null;
}

function buildVersion() {
  const base = resolveBaseVersion();
  const parts = base.split(".").map(Number);
  if (parts.length < 3) return base;

  // Count commits since the tag that gave us this base version
  const tag = `v${parts[0]}.${parts[1]}.${parts[2]}`;
  const count = commitCountSince(tag);

  // count === 0 → on the tagged commit itself
  // count > 0  → some commits after the tag
  if (count === null || count === 0) return base;
  return `${base}.${count}`;
}

function applyVersion(version) {
  const raw = fs.readFileSync(PKG_PATH, "utf-8");
  const pkg = JSON.parse(raw);
  if (pkg.version === version) return false;
  pkg.version = version;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
  return true;
}

// ─── CLI ───

const version = buildVersion();
const shouldApply = process.argv.includes("--apply");

if (shouldApply) {
  const changed = applyVersion(version);
  if (changed) {
    console.log(`[auto-version] ${version} (updated package.json)`);
  } else {
    console.log(`[auto-version] ${version} (unchanged)`);
  }
} else {
  console.log(version);
}
