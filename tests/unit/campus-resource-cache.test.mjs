import assert from "node:assert/strict";
import test from "node:test";
import { CampusResourceCache } from "../../js/map/resource-cache.js";
import { createCampusLoader } from "../../js/map/campus-loader.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve=yes; reject=no; });
  return { promise, resolve, reject };
}

test("map JSON and decoded images share in-flight work and retain ready resources",async()=>{
  let fetches=0,images=0,decodes=0;
  const gate=deferred(),data={frames:{}};
  const cache=new CampusResourceCache({
    fetch:async()=>{fetches++;await gate.promise;return{ok:true,json:async()=>data};},
    createImage:()=>{images++;return{decode:async()=>{decodes++;await gate.promise;}};},
  });
  const a=cache.json("skin"),b=cache.json("skin"),c=cache.image("atlas"),d=cache.image("atlas");
  await Promise.resolve();gate.resolve();
  const [jsonA,jsonB,imageA,imageB]=await Promise.all([a,b,c,d]);
  assert.equal(jsonA,jsonB);assert.equal(imageA,imageB);
  assert.equal(await cache.json("skin"),data);assert.equal(await cache.image("atlas"),imageA);
  assert.deepEqual([fetches,images,decodes],[1,1,1]);
});

test("aborting one map consumer does not cancel a shared preload or poison later entry",async()=>{
  const gate=deferred(),controller=new AbortController();let fetches=0;
  const cache=new CampusResourceCache({fetch:async()=>{fetches++;await gate.promise;return{ok:true,json:async()=>({ready:true})};}});
  const preload=cache.json("map"),consumer=cache.json("map",{signal:controller.signal});
  controller.abort();await assert.rejects(consumer,{name:"AbortError"});gate.resolve();
  assert.deepEqual(await preload,{ready:true});assert.equal(await cache.json("map"),await preload);assert.equal(fetches,1);
  await assert.rejects(cache.json("unused",{signal:controller.signal}),{name:"AbortError"});assert.equal(fetches,1);
});

test("failed map fetches and image decodes are evicted so entry can retry",async()=>{
  let fetches=0,images=0;
  const cache=new CampusResourceCache({
    fetch:async()=>({ok:++fetches>1,json:async()=>({ready:true})}),
    createImage:()=>{const attempt=++images;return{decode:async()=>{if(attempt===1)throw Error("decode failed");}};},
  });
  await assert.rejects(cache.json("map"));await assert.rejects(cache.image("atlas"));
  assert.deepEqual(await cache.json("map"),{ready:true});await cache.image("atlas");
  assert.deepEqual([fetches,images],[2,2]);
});

test("campus manager and its per-mode masks survive repeated map visits",async()=>{
  let fetches=0;
  const config={version:"test",maps:[{id:"room",background:"room.png",world:{width:32,height:32},spawn:{x:16,y:16},collision:{paths:[[[0,0],[32,0],[32,32],[0,32]]],obstacles:[]}}]};
  const resources=new CampusResourceCache({fetch:async()=>{fetches++;return{ok:true,json:async()=>config};}});
  const loader=createCampusLoader({resources});
  const [a,b]=await Promise.all([loader.getManager(),loader.getManager()]);
  assert.equal(a,b);assert.equal(await loader.getManager(),a);assert.equal(fetches,1);
  assert.equal(a.mask("room",{mode:"before"}),b.mask("room",{mode:"before"}));
  assert.notEqual(a.mask("room",{mode:"before"}),b.mask("room",{mode:"after"}));
});
