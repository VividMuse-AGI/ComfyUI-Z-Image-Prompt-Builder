import assert from "node:assert/strict";

// Identical contract against both real panels, with their existing DOM harnesses.
export async function organizationPanelCases({kind, create, save, open, template, language,
  confirm, downloads, downloadJSON}) {
  const copy = x => JSON.parse(JSON.stringify(x));
  const flatten = e => [e, ...e.children.flatMap(flatten)];
  const get = (p, label) => {
    const e = flatten(p).find(e => e.attributes?.["aria-label"] === label || (e.tag === "button" && e.textContent === label));
    assert.ok(e, `Missing ${label}`); return e;
  };
  const click = (p, label) => get(p, label).click();
  const change = async (p, label, value, type = "change") => {
    const e = get(p, label); typeof value === "boolean" ? e.checked = value : e.value = value; await e.fire(type);
  };
  const P = "vividMuseCardOrganization", shoot = kind === "shoot";
  const store = shoot ? "vividMuseShootPlanCards" : "vividMuseContentCards";
  for (const en of [false, true]) {
    language(en ? "en" : "zh"); confirm(true);
    const t = (zh, eng) => en ? eng : zh;
    const listLabel = shoot ? t("已保存拍摄方案卡", "Saved shoot plan cards") : t("已保存卡片", "Saved cards");
    const searchLabel = shoot ? t("搜索名称或模块", "Search names or modules") : t("搜索卡片名称", "Search card names");
    const nameLabel = shoot ? t("卡片名称（最多 80 个字符）", "Card name (up to 80 characters)") : t("卡片名称", "Card name");
    const applyLabel = shoot ? t("应用所选模块", "Apply Selected Modules") : t("应用卡片", "Apply Card");
    const node = await create();
    for (const name of ["Beta", "alpha", "éclair"]) save(node, {...copy(template), name});
    const original = JSON.stringify(node.properties), widgets = JSON.stringify(node.widgets.map(w => [w.name, w.value]));
    let p = open(node);
    assert.equal(JSON.stringify(node.properties), original, "Opening must not migrate properties");
    assert.equal(get(p, listLabel).value, "Beta");
    await click(p, t("收藏卡片", "Favorite Card"));
    assert.equal(node.properties[P].favorites.map(c => c.name).join(), "Beta");
    assert.equal(get(p, listLabel).options.find(o => o.value === "Beta").textContent, "★ Beta");
    const stored = JSON.stringify(node.properties[store]);
    await change(p, t("卡片排序", "Card sort order"), "name");
    assert.equal(get(p, listLabel).options[0].value, "alpha");
    assert.equal(get(p, listLabel).value, "Beta");
    await change(p, t("卡片排序", "Card sort order"), "favorites");
    assert.equal(get(p, listLabel).options[0].value, "Beta");
    assert.equal(JSON.stringify(node.properties[store]), stored);
    await change(p, t("仅收藏", "Favorites only"), true);
    await click(p, t("取消收藏", "Unfavorite Card"));
    assert.equal(get(p, listLabel).options.length, 0);
    assert.equal(get(p, listLabel).value, ""); assert.ok(get(p, applyLabel).disabled);
    assert.match(flatten(p).map(e => e.textContent).join("\n"), en ? /not deleted/ : /未删除/);
    await click(p, t("重置筛选", "Reset Filters"));
    assert.equal(get(p, listLabel).value, "", "Reset must not silently select another card");
    await change(p, listLabel, "alpha"); await click(p, t("收藏卡片", "Favorite Card"));
    await change(p, searchLabel, "Beta", "input");
    assert.equal(get(p, listLabel).value, ""); assert.ok(get(p, applyLabel).disabled);
    await click(p, t("重置筛选", "Reset Filters"));
    await change(p, listLabel, "alpha");
    assert.equal(JSON.stringify(node.widgets.map(w => [w.name, w.value])), widgets);
    // Hidden selections remain selected, and all export names remain visible.
    await click(p, t("导出卡片包", "Export Card Pack"));
    await click(p, t("清空勾选", "Clear Selection"));
    assert.ok(get(p, t("确认导出卡片包", "Confirm Export Pack")).disabled);
    await change(p, t("筛选导出卡片", "Filter export cards"), "alpha", "input");
    await click(p, t("选择筛选结果", "Select Matches"));
    await change(p, t("筛选导出卡片", "Filter export cards"), "Beta", "input");
    await click(p, t("选择筛选结果", "Select Matches"));
    await click(p, t("取消筛选结果", "Deselect Matches"));
    assert.match(flatten(p).map(e => e.textContent).join("\n"), en ? /1 \/ 3 selected; 1 visible/ : /已选择 1 \/ 3 张；当前可见 1 张/);
    await click(p, t("选择筛选结果", "Select Matches"));
    const exportSearch = get(p, t("筛选导出卡片", "Filter export cards"));
    await exportSearch.fire("compositionstart"); await p.fire("compositionstart", {target: exportSearch});
    await change(p, t("筛选导出卡片", "Filter export cards"), "missing", "input");
    assert.match(flatten(p).map(e => e.textContent).join("\n"), en ? /2 \/ 3 selected; 1 visible/ : /已选择 2 \/ 3 张；当前可见 1 张/);
    await exportSearch.fire("compositionend"); await p.fire("compositionend", {target: exportSearch});
    assert.match(flatten(p).map(e => e.textContent).join("\n"), en ? /2 \/ 3 selected; 0 visible/ : /已选择 2 \/ 3 张；当前可见 0 张/);
    assert.ok(flatten(p).some(e => e.tag === "pre" && e.textContent.includes("Beta") && e.textContent.includes("alpha")));
    const beforeDownload = downloads.length;
    await click(p, t("确认导出卡片包", "Confirm Export Pack"));
    assert.equal(downloads.length, beforeDownload + 1);
    const exported = await downloadJSON();
    assert.deepEqual(exported.cards.map(c => c.name), ["Beta", "alpha"]);
    assert.equal(exported.version, 1); assert.ok(!JSON.stringify(exported).includes("favorites"));
    // An open export preview follows favorites changes, without losing checks.
    await click(p, t("导出卡片包", "Export Card Pack"));
    await change(p, t("导出仅看收藏", "Show favorite export cards only"), true);
    await click(p, t("取消收藏", "Unfavorite Card"));
    assert.match(flatten(p).map(e => e.textContent).join("\n"), en ? /3 \/ 3 selected; 0 visible/ : /已选择 3 \/ 3 张；当前可见 0 张/);
    await click(p, t("取消", "Cancel"));
    // Detached confirmation callbacks cannot export a cancelled preview.
    await click(p, t("导出卡片包", "Export Card Pack"));
    const staleExport = get(p, t("确认导出卡片包", "Confirm Export Pack"));
    await click(p, t("取消", "Cancel"));
    const countBeforeStale = downloads.length; await staleExport.fire("click");
    assert.equal(downloads.length, countBeforeStale);
    await click(p, t("收藏卡片", "Favorite Card"));
    await change(p, nameLabel, "Renamed");
    await click(p, shoot ? t("使用上方名称重命名", "Rename Using Name Above") : t("重命名", "Rename"));
    assert.equal(node.properties[P].favorites[0].name, "Renamed");
    assert.ok(!node.properties[store].some(c => c.name === "alpha"));
    await click(p, t("删除卡片", "Delete Card"));
    assert.equal(node.properties[P].favorites.length, 0);
    assert.equal(get(p, listLabel).value, ""); assert.ok(get(p, applyLabel).disabled);
    assert.equal(JSON.stringify(node.widgets.map(w => [w.name, w.value])), widgets);
    await p.close();
    // Workflow JSON keeps favorites; panel-local view settings reset on reopen.
    p = open(node); await click(p, t("收藏卡片", "Favorite Card"));
    await change(p, t("卡片排序", "Card sort order"), "name");
    await change(p, t("仅收藏", "Favorites only"), true);
    const restored = await create(); restored.properties = copy(node.properties); await p.close();
    p = open(restored);
    assert.equal(get(p, t("卡片排序", "Card sort order")).value, "default");
    assert.equal(get(p, t("仅收藏", "Favorites only")).checked, false);
    assert.ok(get(p, t("取消收藏", "Unfavorite Card"))); await p.close();
    // Unsupported organization metadata is preserved until explicitly reset.
    node.properties[P] = {version: 99, untouched: "sentinel"};
    const futureBefore = JSON.stringify(node.properties); p = open(node);
    assert.ok(get(p, t("收藏卡片", "Favorite Card")).disabled);
    assert.equal(get(p, t("重置收藏数据", "Reset Favorites Data")).hidden, false);
    assert.equal(JSON.stringify(node.properties), futureBefore);
    confirm(false); await click(p, t("重置收藏数据", "Reset Favorites Data"));
    assert.equal(JSON.stringify(node.properties), futureBefore);
    confirm(true); await click(p, t("重置收藏数据", "Reset Favorites Data"));
    assert.equal(node.properties[P].version, 1); assert.equal(node.properties[P].favorites.length, 0);
    assert.ok(!get(p, t("收藏卡片", "Favorite Card")).disabled); await p.close();
    console.log(`PASS ${kind} organization UI (${en ? "en" : "zh"}): favorite/filter/sort, safe selection, batch counts/exports, rename/delete, workflow roundtrip, future metadata reset`);
  }
  language("zh"); confirm(true);
}
