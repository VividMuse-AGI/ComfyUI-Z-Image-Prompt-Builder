import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/js/txt_library.js", import.meta.url), "utf8")
  .replace('import { app } from "../../scripts/app.js";',
    "const app = { registerExtension() {} };");
const context = vm.createContext({});
vm.runInContext(source + "\nglobalThis.parse = parseTxtPromptLibrary;", context);
const txt = fs.readFileSync(new URL("../examples/组合兼容性验收.txt", import.meta.url), "utf8");
const entries = context.parse(txt);
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
