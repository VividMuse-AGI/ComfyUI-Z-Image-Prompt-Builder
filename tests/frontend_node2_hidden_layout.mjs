import assert from "node:assert/strict";
import fs from "node:fs";

const visibilityFiles = [
  "../web/js/preset_sync.js",
  "../web/js/txt_library.js",
  "../web/js/txt_module_library.js",
];

for (const relativePath of visibilityFiles) {
  const sourcePath = new URL(relativePath, import.meta.url);
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.match(
    source,
    /widget\.type = "hidden";/,
    `${relativePath} must use the Node 2.0 zero-height widget type`,
  );
}

console.log("frontend Node 2.0 hidden widget layout ok");
