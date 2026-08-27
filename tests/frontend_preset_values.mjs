import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../web/js/preset_sync.js", import.meta.url);
let source = fs.readFileSync(sourcePath, "utf8");
source = source.replace(
  'import { app } from "../../scripts/app.js";',
  "const app = { registerExtension() {} };",
);
source += "\nglobalThis.__presetValues = PRESETS;\nglobalThis.__legacyPresetNames = LEGACY_PRESET_NAMES;\n";
vm.runInThisContext(source, { filename: sourcePath.pathname });

const presets = globalThis.__presetValues;
const legacyPresetNames = globalThis.__legacyPresetNames;
assert.equal(Object.keys(presets).length, 11);
assert.equal(legacyPresetNames["日系森系夏日柔光写真"], "日系草地单车夏日柔光写真");
assert.equal(legacyPresetNames["古风汉服写真"], "古风汉服园林柔光写真");
assert.equal(legacyPresetNames["海边假日度假写真"], "海边夏日泳装写真");
assert.equal(presets["日系草地单车夏日柔光写真"]["基础姿态"], "单车侧坐");
assert.equal(presets["日系咖啡馆暖调近景人像"]["成像媒介"], "手机计算摄影");
assert.equal(presets["夜间室内轻奢硬闪时尚写真"]["基础姿态"], "复古扶手椅坐姿");
assert.equal(presets["都市职场轻奢坐姿写真"]["腿部动作"], "膝部交叠坐姿");
assert.equal(presets["古风汉服园林柔光写真"]["手部动作"], "双手持刺绣团扇");
assert.equal(presets["海边夏日泳装写真"]["基础姿态"], "沙滩侧卧");
assert.equal(presets["赛博都市夜景写真"]["基础姿态"], "地面侧坐");
assert.equal(presets["影棚水光妆美容特写"]["景别"], "面部特写");
assert.equal(presets["落地窗瑜伽塑形写真"]["基础姿态"], "低位鸽子式");
assert.equal(presets["旅馆窗边电影静帧"]["画面比例"], "21:9横构图");

console.log("frontend preset values ok");
