import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../web/js/modular_nodes.js", import.meta.url);
let registeredExtension = null;
globalThis.__modularTestApp = {
  graph: { setDirtyCanvas() {} },
  registerExtension(extension) { registeredExtension = extension; },
};
const source = fs.readFileSync(sourcePath, "utf8").replace(
  'import { app } from "../../scripts/app.js";',
  "const app = globalThis.__modularTestApp;",
);
vm.runInThisContext(source, { filename: sourcePath.pathname });
assert.ok(registeredExtension);

const SPECIAL_VALUES = ["跟随预设", "随机抽取", "不使用"];

function makeNode(comfyClass, fieldValues) {
  const widgets = [
    { name: "预设", type: "combo", value: "日系草地单车夏日柔光写真", options: {} },
    { name: "提示词密度", type: "combo", value: "标准", options: {} },
    { name: "随机种子", type: "number", value: 0, options: {} },
    ...Object.entries(fieldValues).map(([name, value]) => ({
      name,
      type: "combo",
      value,
      options: { values: [...SPECIAL_VALUES, value, "备用值"] },
      computeSize() { return [320, 24]; },
    })),
  ];
  return {
    comfyClass,
    properties: {},
    widgets,
    size: [320, 400],
    addWidget(type, name, value, callback, options = {}) {
      const widget = {
        type, name, value, callback, options,
        computeSize() { return [320, 24]; },
      };
      this.widgets.push(widget);
      return widget;
    },
    computeSize() {
      return [320, this.widgets.filter((item) => !item.hidden).length * 24 + 60];
    },
    setSize(size) { this.size = size; },
    setDirtyCanvas() {},
  };
}

function widget(node, name) {
  const found = node.widgets.find((item) => item.name === name);
  assert.ok(found, `missing widget: ${name}`);
  return found;
}

function change(node, name, value) {
  const target = widget(node, name);
  target.value = value;
  target.callback?.(value);
}

const hairNode = makeNode("VividMuse_ZImageHairModule", {
  "发色模式": "基础发色",
  "发色": "深棕黑色",
  "发色色调": "冷调",
  "染色方式": "自然渐变染",
  "头发长度": "及胸长发",
  "发质与卷度": "柔和微卷",
  "发型造型": "半扎发",
  "刘海": "自然中分",
  "头部配饰": "不使用",
});
registeredExtension.nodeCreated(hairNode);
for (const name of ["🎲 生成本模块随机组合", "全部跟随模块预设", "清空本模块"]) {
  const button = widget(hairNode, name);
  assert.equal(button.serialize, false);
  assert.equal(button.options.serialize, false);
}
assert.equal(widget(hairNode, "发色色调").hidden, true);
assert.equal(widget(hairNode, "发色色调").options.hidden, true);
change(hairNode, "发色模式", "备用值");
assert.equal(widget(hairNode, "发色色调").hidden, false);

widget(hairNode, "🎲 生成本模块随机组合").callback();
for (const name of [
  "发色模式", "发色", "发色色调", "染色方式", "头发长度",
  "发质与卷度", "发型造型", "刘海", "头部配饰",
]) {
  assert.equal(widget(hairNode, name).value, "随机抽取");
}
widget(hairNode, "清空本模块").callback();
assert.equal(widget(hairNode, "发色").value, "不使用");
change(hairNode, "预设", "日系咖啡馆暖调近景人像");
assert.equal(widget(hairNode, "发色").value, "跟随预设");

const serialized = { widgets_values: hairNode.widgets.map((item) => item.value) };
hairNode.onSerialize(serialized);
assert.equal(serialized.widgets_values.length, 12);

const personNode = makeNode("VividMuse_ZImagePersonModule", {
  "年龄阶段": "20–29岁", "族裔大类": "东亚", "地域族裔分支": "大类通用外观",
  "脸型": "标准鹅蛋脸", "轮廓细节": "颧骨柔和", "眼型": "杏仁眼",
  "瞳色": "深棕色", "眼睑特征": "自然双眼皮", "肤色": "自然浅肤色",
  "肤质": "真实皮肤纹理", "妆容模式": "整体预设", "整体妆容预设": "自然裸妆",
  "底妆质感": "自然清透底妆", "眼影色系": "裸棕眼影", "眼线造型": "自然内眼线",
  "唇妆颜色": "裸粉唇色", "唇面质感": "水润唇面", "基础身形": "自然匀称",
  "身量观感": "中等身量", "线条重点": "腰线自然清晰",
});
registeredExtension.nodeCreated(personNode);
assert.equal(widget(personNode, "整体妆容预设").hidden, false);
assert.equal(widget(personNode, "底妆质感").hidden, true);
change(personNode, "妆容模式", "分项自定义");
assert.equal(widget(personNode, "整体妆容预设").hidden, true);
assert.equal(widget(personNode, "底妆质感").hidden, false);

const clothingNode = makeNode("VividMuse_ZImageClothingModule", {
  "穿搭结构": "连衣裙",
  "连衣裙类型": "碎花吊带连衣裙", "连衣裙颜色": "薄荷绿",
  "连衣裙材质": "雪纺", "连衣裙图案": "细小碎花",
  "连体服类型": "修身连体裤", "连体服颜色": "玄黑色",
  "连体服材质": "西装面料", "连体服图案": "纯色无图案",
  "上装类型": "白衬衫", "上装颜色": "象牙白", "上装材质": "棉质",
  "上装图案": "纯色无图案", "下装类型": "牛仔裤", "下装颜色": "牛仔蓝",
  "下装材质": "牛仔布", "下装图案": "纯色无图案", "版型细节": "收腰",
  "袜装": "不使用", "鞋履": "白色运动鞋", "服装配件": "腕表",
});
registeredExtension.nodeCreated(clothingNode);
assert.equal(widget(clothingNode, "连衣裙类型").hidden, false);
assert.equal(widget(clothingNode, "连体服类型").hidden, true);
assert.equal(widget(clothingNode, "上装类型").hidden, true);
assert.equal(widget(clothingNode, "鞋履").hidden, undefined);

console.log("frontend modular nodes ok");
