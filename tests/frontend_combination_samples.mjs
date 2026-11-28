import assert from "node:assert/strict";
import fs from "node:fs";
import { createVmContext, loadLibModule } from "./vm_loader.mjs";

const context = createVmContext({ app: { registerExtension() {} } });
const txtLib = loadLibModule("txt_library", context, { expose: ["parseTxtPromptLibrary"] });
const txt = fs.readFileSync(new URL("../examples/组合兼容性验收.txt", import.meta.url), "utf8");
const entries = txtLib.parseTxtPromptLibrary(txt);
assert.equal(entries.length, 6);
assert.equal(entries[0].title, "拳击运动搭配");
assert.equal(entries[5].title, "手袋完整展示");
for (const entry of entries) {
  assert.ok(entry.tags.includes("待生图验证"));
  assert.ok(entry.prompt.includes("\n\n"));
  assert.ok(!entry.prompt.includes("验收重点"));
  assert.ok(!entry.prompt.includes("标签："));
  assert.ok(!entry.prompt.includes("---"));
}
console.log("acceptance TXT imports six prompts without instructions or tags");
