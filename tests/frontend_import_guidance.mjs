import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL('../web/js/import_guidance.js', import.meta.url), 'utf8');
const api = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
let count = 0;
const check = (name, fn) => { fn(); count++; };
const fixtures = [
  ['vividmuse-content-card', 'content-card'], ['vividmuse-content-card-pack', 'content-pack'],
  ['vividmuse-shoot-plan-card', 'shoot-plan'], ['vividmuse-shoot-plan-card-pack', 'shoot-plan'],
  ['vividmuse-favorites', 'favorites'], ['vividmuse-prompt-result', null],
  ['vividmuse-txt-selection-result', null],
];
const entries = ['content-card', 'content-pack', 'shoot-plan', 'favorites', 'preset'];
for (const [kind, entry] of fixtures) for (const target of entries) {
  check(`${kind} -> ${target}`, () => {
    const raw = JSON.stringify({kind, version: 1}); // Declaration alone must never mean valid.
    const result = api.inspectImportText(raw, target);
    assert.equal(result.status, entry === target ? 'needs-validation' : entry ? 'wrong-entry' : 'result-record');
    assert.equal(Object.hasOwn(result, 'data'), entry === target);
    for (const language of ['zh', 'en']) {
      const message = api.importGuidanceMessage(result, language);
      if (entry !== target) assert.ok(message.length > 20);
      assert.ok(!message.includes('[object Object]'));
    }
  });
}
for (const target of entries) {
  check(`version ${target}`, () => {
    const kind = fixtures.find(x => x[1] === target)?.[0];
    const raw = kind ? {kind, version: 2} : {version: 2, type: 'X', name: 'saved', values: {}};
    assert.equal(api.inspectImportText(JSON.stringify(raw), target).status, 'unsupported-version');
  });
}
check('wrong entry wins over declared version', () => assert.equal(api.inspectImportText(
  '{"kind":"vividmuse-content-card-pack","version":99}', 'favorites').status, 'wrong-entry'));
check('legacy preset stays with original validator', () => {
  for (const value of [{}, {version:1,type:'X',name:'saved',values:{}}, {version:1,type:'X',values:[]},
    {version:1,type:'X',name:'saved',values:{},kind:'user-added-metadata'}])
    assert.equal(api.inspectImportText(JSON.stringify(value), 'preset').status, 'needs-validation');
});
check('preset inference is cautious', () => {
  const r = api.inspectImportText('{"version":1,"type":"X","name":"saved","values":{}}', 'favorites');
  assert.equal(r.status, 'wrong-entry');
  assert.match(api.importGuidanceMessage(r, 'zh'), /疑似/);
  assert.match(api.importGuidanceMessage(r, 'en'), /appears/i);
});
check('malformed JSON and no leaked raw content', () => {
  for (const raw of ['', '  ', 'not json', '{"secret":"private"']) {
    const r = api.inspectImportText(raw, 'favorites');
    assert.equal(r.status, 'invalid-json');
    assert.ok(!api.importGuidanceMessage(r, 'en').includes('private'));
  }
});
check('unknown structure', () => {
  for (const data of [null, [], 1, 'text', {kind:'<img onerror=evil>'}, {nodes:[],links:[]}]) {
    const r = api.inspectImportText(JSON.stringify(data), 'favorites');
    assert.equal(r.status, 'unknown-format');
    assert.ok(!api.importGuidanceMessage(r, 'en').includes('<img'));
  }
});
check('BOM policy is explicit, not relaxed globally', () => {
  const raw='\uFEFF{"kind":"vividmuse-shoot-plan-card","version":1}';
  assert.equal(api.inspectImportText(raw,'shoot-plan').status,'invalid-json');
  assert.equal(api.inspectImportText(raw,'shoot-plan',{stripBom:true}).status,'needs-validation');
});
check('UTF-8 byte limit', () => {
  const raw=JSON.stringify({kind:'vividmuse-favorites',version:1,padding:'汉'.repeat(400000)});
  assert.ok(raw.length<api.IMPORT_MAX_BYTES);
  assert.equal(api.inspectImportText(raw,'favorites').status,'too-large');
  const head='{"kind":"vividmuse-favorites","version":1,"padding":"';
  const edge=head+'a'.repeat(api.IMPORT_MAX_BYTES-head.length-2)+'"}';
  assert.equal(api.inspectImportText(edge,'favorites').status,'needs-validation');
  assert.equal(api.inspectImportText(edge+' ','favorites').status,'too-large');
});
check('unsupported target is a programming error', () => assert.throws(() => api.inspectImportText('{}','bogus')));
let reads=0;
const file=(raw,size=new Blob([raw]).size)=>({size,async text(){reads++;return raw;}});
assert.equal((await api.readImportFile(null,'favorites')).status,'cancelled'); count++;
assert.equal((await api.readImportFile(file('{}',api.IMPORT_MAX_BYTES+1),'favorites')).status,'too-large');
assert.equal(reads,0); count++;
assert.equal((await api.readImportFile(file('{}'),'favorites',{isCurrent:()=>false})).status,'stale');
assert.equal(reads,0); count++;
let active=true;
const staleFile={size:2,async text(){active=false;return '{}';}};
assert.equal((await api.readImportFile(staleFile,'favorites',{isCurrent:()=>active})).status,'stale'); count++;
assert.equal((await api.readImportFile({size:1,async text(){throw Error('private path');}},'favorites')).status,'read-failed'); count++;
const good=await api.readImportFile(file('{"kind":"vividmuse-favorites","version":1,"favorites":[]}'),'favorites');
assert.equal(good.status,'needs-validation'); assert.deepEqual(good.data.favorites,[]); count++;
const over=await api.readImportFile(file('汉'.repeat(api.IMPORT_MAX_BYTES),1),'favorites');
assert.equal(over.status,'too-large'); count++;
let generation=1, finishFirst;
const first=api.readImportFile({size:2,text:()=>new Promise(resolve=>{finishFirst=resolve;})},'preset',{isCurrent:()=>generation===1});
generation=2;
const second=await api.readImportFile(file('{}'),'preset',{isCurrent:()=>generation===2});
assert.equal(second.status,'needs-validation');
finishFirst('{}'); assert.equal((await first).status,'stale'); count++;
for(const status of ['cancelled','stale']) assert.equal(api.importGuidanceMessage({status},'en'),'');
assert.ok(!/document\.|localStorage|\.random\(/.test(source));
console.log(`Import guidance: ${count} cases passed; classification never claims schema validity.`);
