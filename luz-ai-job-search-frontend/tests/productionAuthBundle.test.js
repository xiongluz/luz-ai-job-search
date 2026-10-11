import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const FORBIDDEN_MARKERS = [
  "/login/wechat/dev-session",
  "local-dev-openid",
  "X-GQLD-Local-Dev-Token",
  "VITE_LOCAL_AUTH_BYPASS",
];

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith(".js") ? [absolutePath] : [];
  }));
  return nested.flat();
}

test("production assets contain no local authentication bypass", async () => {
  const assetsDirectory = path.resolve("dist", "assets");
  const files = await javascriptFiles(assetsDirectory);
  assert.ok(files.length > 0, "production build must contain JavaScript assets");

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const marker of FORBIDDEN_MARKERS) {
      assert.equal(source.includes(marker), false, `${marker} leaked into ${file}`);
    }
  }
});
