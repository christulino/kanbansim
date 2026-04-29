import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist", "assets");
const BUDGET_KB = 280;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

function directoryExists(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

describe("bundle size", () => {
  it.skipIf(!directoryExists(DIST))("stays within the gzipped JS budget", () => {
    const files = walk(DIST);
    let totalGz = 0;
    for (const f of files) {
      totalGz += gzipSync(readFileSync(f)).length;
    }
    const totalKb = totalGz / 1024;
    expect(totalKb, `Total gzipped JS: ${totalKb.toFixed(1)} KB`).toBeLessThan(BUDGET_KB);
  });
});
