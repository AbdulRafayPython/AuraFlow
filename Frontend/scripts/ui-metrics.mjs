// Static UI metrics for docs/UI_REDESIGN_PLAN.md section 7 (metric gates).
// Counts anti-pattern class usage in src/ and fails if a "clean" count grows
// past the ratchet baseline below. Run: npm run ui:metrics
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = join(root, "src");

const checks = {
  "gradients (bg-gradient-to / linear-gradient)": /\b(?:bg-gradient-to-|linear-gradient\(|radial-gradient\()/g,
  "glow / neon (shadow-neon, shadow-[0_0_..], theme-glow)": /\b(?:shadow-neon|btn-neon|shadow-\[0_0_|theme-glow|theme-pulse-glow)/g,
  "backdrop-blur / blur-*": /\b(?:backdrop-blur(?:-[a-z0-9]+)?|(?<![a-z-])blur-(?:sm|md|lg|xl|2xl|3xl|\[))/g,
  "infinite pulse/ping/bounce": /\banimate-(?:pulse|ping|bounce)\b/g,
  "text below 12px (text-[<12px])": /\btext-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/g,
  "rounded-2xl/3xl (now 12px alias)": /\brounded-(?:2xl|3xl)\b/g,
};

// Ratchet: counts may only go down. Update after each phase.
const baseline = {
  "gradients (bg-gradient-to / linear-gradient)": 0,
  "glow / neon (shadow-neon, shadow-[0_0_..], theme-glow)": 0,
  "backdrop-blur / blur-*": 0,
  "infinite pulse/ping/bounce": 0,
  "text below 12px (text-[<12px])": 0,
  "rounded-2xl/3xl (now 12px alias)": 82,
};

const exempt = [/[\\/]components[\\/]marketing[\\/]/, /LandingPage\.tsx$/, /[\\/]styles[\\/]/];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|css)$/.test(name)) yield p;
  }
}

const totals = Object.fromEntries(Object.keys(checks).map((k) => [k, 0]));
const perFile = {};
for (const file of walk(src)) {
  if (exempt.some((re) => re.test(file))) continue;
  const text = readFileSync(file, "utf8");
  for (const [name, re] of Object.entries(checks)) {
    const n = (text.match(re) || []).length;
    if (n) {
      totals[name] += n;
      perFile[file] = (perFile[file] || 0) + n;
    }
  }
}

let failed = false;
console.log("UI metrics (src/, marketing + landing exempt)\n");
for (const [name, n] of Object.entries(totals)) {
  const limit = baseline[name];
  const over = n > limit;
  failed ||= over;
  console.log(`${over ? "FAIL" : "ok  "}  ${String(n).padStart(4)} / ${limit}  ${name}`);
}
console.log("\nTop offenders:");
Object.entries(perFile)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .forEach(([f, n]) => console.log(`  ${String(n).padStart(4)}  ${relative(root, f)}`));

process.exit(failed ? 1 : 0);
