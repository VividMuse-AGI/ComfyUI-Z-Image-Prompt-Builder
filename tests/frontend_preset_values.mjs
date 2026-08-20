import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../web/js/preset_sync.js", import.meta.url);
let source = fs.readFileSync(sourcePath, "utf8");
source = source.replace(
  'import { app } from "../../scripts/app.js";',
  "const app = { registerExtension() {} };",
);
source += "\nglobalThis.__presetValues = PRESETS;\n";
vm.runInThisContext(source, { filename: sourcePath.pathname });

const presets = globalThis.__presetValues;
assert.equal(presets["日系森系夏日柔光写真"]["成像媒介"], "35毫米胶片摄影");
assert.equal(presets["海边假日度假写真"]["成像媒介"], "便携数码相机摄影");
assert.equal(presets["古风汉服写真"]["表情"], "温柔浅笑");
assert.equal(presets["赛博都市夜景写真"]["基础姿态"], "行走中停步");
assert.equal(presets["赛博都市夜景写真"]["身体重心"], "重心轻微前移");
assert.equal(presets["赛博都市夜景写真"]["腿部动作"], "自然迈步");

console.log("frontend preset values ok");
