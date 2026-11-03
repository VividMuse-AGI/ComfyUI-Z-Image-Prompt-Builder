import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../web/js/card_organization.js', import.meta.url), 'utf8');
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const P = api.CARD_ORGANIZATION_PROPERTY, C = api.CONTENT_CARD_STORE, S = api.SHOOT_CARD_STORE;
const card = name => ({kind:'vividmuse-content-card',version:1,module:'人物',name,values:{fixture:'keep'}});
const shoot = name => ({kind:'vividmuse-shoot-plan-card',version:1,name,modules:{摄影:{fixture:'keep'}}});
const a=card('A'), b=card('B'), s=shoot('A');
const metadata = cards => ({version:1,favorites:cards.map(api.cardReference)});
const clone = x => JSON.parse(JSON.stringify(x));
let groups=0;
function test(name,run){run();groups++;console.log('PASS '+name);}
function make() {
  const node={id:7,properties:{[C]:clone([a,b]),[S]:clone([s]),seed:42,free:'keep',vividMuseRandomLocks:['x']}};
  const history=[], redo=[]; let previous;
  node.graph={getNodeById:id=>id===7?node:null,
    beforeChange(){previous=clone(node.properties);},
    afterChange(){history.push({before:previous,after:clone(node.properties)});},
    undo(){const item=history.pop();if(item){node.properties=clone(item.before);redo.push(item);}},
    redo(){const item=redo.pop();if(item){node.properties=clone(item.after);history.push(item);}},
  };
  return {node,history};
}
test('favorite transaction is one undo unit, keeps fields and other stores',()=>{
  const {node,history}=make(), before=clone(node.properties);
  const plan=api.planNodeFavorite(node,a,true);
  assert.deepEqual(node.properties,before);
  assert.equal(api.commitNodeCardOrganization(node,plan),true);
  assert.equal(history.length,1);assert.deepEqual(node.properties[P],metadata([a]));
  for(const key of Object.keys(before)) assert.deepEqual(node.properties[key],before[key]);
  node.graph.undo();assert.deepEqual(node.properties,before);
  node.graph.redo();assert.deepEqual(node.properties[P],metadata([a]));
  assert.throws(()=>api.commitNodeCardOrganization(node,plan));
});
test('rename and favorite metadata move in one transaction; undo restores both',()=>{
  const {node,history}=make();node.properties[P]=metadata([a,s]);
  const original=clone(node.properties), renamed=card('new');
  const plan=api.planNodeCardCollection(node,C,[renamed,b],{from:a,to:renamed});
  api.commitNodeCardOrganization(node,plan);
  assert.equal(history.length,1);
  assert.deepEqual(node.properties[P],metadata([s,renamed]));
  node.graph.undo();assert.deepEqual(node.properties,original);
});
test('delete, replacement and imports preserve intended favorite identity',()=>{
  const {node}=make();node.properties[P]=metadata([a,b,s,card('incoming')]);
  api.commitNodeCardOrganization(node,api.planNodeCardCollection(node,C,[b,card('incoming')]));
  assert.deepEqual(node.properties[P],metadata([b,s]));
  const updated={...b,values:{fixture:'updated'}};
  api.commitNodeCardOrganization(node,api.planNodeCardCollection(node,C,[updated,card('incoming')]));
  assert.deepEqual(node.properties[P],metadata([b,s]));
});
test('future metadata does not block card edits, but requires reset for favorites',()=>{
  const {node}=make();node.properties[P]={version:99,custom:'keep'};
  assert.throws(()=>api.planNodeFavorite(node,a,true));
  api.commitNodeCardOrganization(node,api.planNodeCardCollection(node,C,[b]));
  assert.deepEqual(node.properties[P],{version:99,custom:'keep'});
  api.commitNodeCardOrganization(node,api.planNodeOrganizationReset(node));
  assert.deepEqual(node.properties[P],metadata([]));
});
test('damaged other store does not block valid card edits or overwrite metadata',()=>{
  const {node,history}=make();node.properties[S]=[{kind:'future-card'}];node.properties[P]=metadata([a]);
  const other=clone(node.properties[S]), organization=clone(node.properties[P]);
  assert.throws(()=>api.planNodeFavorite(node,a,true));
  api.commitNodeCardOrganization(node,api.planNodeCardCollection(node,C,[b]));
  assert.deepEqual(node.properties[S],other);assert.deepEqual(node.properties[P],organization);
  assert.deepEqual(node.properties[C],[b]);assert.equal(history.length,1);
  node.graph.undo();assert.deepEqual(node.properties[C],[a,b]);
});
test('stale properties, owner and node generation are rejected without writes',()=>{
  for(const mutate of [n=>{n.properties.free='external';},n=>{n.properties=clone(n.properties);},
    n=>{n.graph={};},n=>{n.__vividMuseCardsGeneration=1;},n=>{n.graph.getNodeById=()=>null;}]){
    const {node,history}=make();const plan=api.planNodeFavorite(node,a,true);mutate(node);
    const before=clone(node.properties);
    assert.throws(()=>api.commitNodeCardOrganization(node,plan));
    assert.deepEqual(node.properties,before);assert.equal(history.length,0);
  }
});
test('forged plans and tampered proposed collections cannot be committed',()=>{
  const {node}=make();assert.throws(()=>api.commitNodeCardOrganization(node,{changed:true}));
  const proposed=[a];const plan=api.planNodeCardCollection(node,C,proposed);
  proposed[0]=card('mutated');api.commitNodeCardOrganization(node,plan);
  assert.deepEqual(node.properties[C],[a]);
  assert.throws(()=>api.planNodeCardCollection(node,'seed',[]));
  assert.throws(()=>api.planNodeCardCollection(node,C,[s]));
});
test('no-op commits create no undo entries; old card edits add no metadata',()=>{
  const {node,history}=make();node.properties[P]=metadata([a,b,s]);
  assert.equal(api.commitNodeCardOrganization(node,api.planNodeFavorite(node,a,true)),false);
  assert.equal(history.length,0);
  delete node.properties[P];api.commitNodeCardOrganization(node,api.planNodeCardCollection(node,C,[a]));
  assert.equal(Object.hasOwn(node.properties,P),false);
});
test('setter failure restores both stores and property absence',()=>{
  const {node}=make();let value=node.properties, fail=true;const original=clone(value);
  Object.defineProperty(node,'properties',{get:()=>value,set:next=>{value=next;if(fail){fail=false;throw Error('setter');}}});
  assert.throws(()=>api.commitNodeCardOrganization(node,api.planNodeFavorite(node,a,true)),/setter/);
  assert.deepEqual(node.properties,original);
});
test('hook failures preserve data, and stale changes in before-hook are not overwritten',()=>{
  for(const hook of ['beforeChange','afterChange']){
    const {node}=make(), original=clone(node.properties);node.graph[hook]=()=>{throw Error('hook');};
    assert.throws(()=>api.commitNodeCardOrganization(node,api.planNodeFavorite(node,a,true)),/hook/);
    assert.deepEqual(node.properties,original);
  }
  const {node}=make();node.graph.beforeChange=()=>{node.properties.free='external';};
  assert.throws(()=>api.commitNodeCardOrganization(node,api.planNodeFavorite(node,a,true)));
  assert.equal(node.properties.free,'external');assert.equal(Object.hasOwn(node.properties,P),false);
});
console.log(`PASS ${groups} card organization transaction groups; simulated undo/redo only, not real host acceptance.`);
