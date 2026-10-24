import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read=path=>readFile(new URL(`../../backend/${path}`,import.meta.url),"utf8");
const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source,{mode:"transform"})).toString("base64")}`;
let source=(await read("src/index.ts")).replace(/^export \{ PostgameCoordinator \} from "\.\/postgame-coordinator";\s*/u,"");
for(const name of ["progression","wishes"])source=source.replace(`"./${name}"`,JSON.stringify(moduleUrl(await read(`src/${name}.ts`))));
const worker=(await import(moduleUrl(source))).default,schema=await read("schema.sql");
const origin="https://game.example.test";

function harness() {
  const db=new DatabaseSync(":memory:");db.exec(schema);
  for(const id of ["owner","other"]){
    db.prepare("INSERT INTO users (id,email) VALUES (?,?)").run(id,`${id}@example.test`);
    db.prepare("INSERT INTO stats (user_id,hp,level,experience) VALUES (?,300,3,400)").run(id);
    db.prepare("INSERT INTO story_progress (user_id,story_id) VALUES (?,'festival-open')").run(id);
    db.prepare("INSERT INTO game_results (id,user_id,attempt_id,game_id,status,score) VALUES (?,?,?,'ai-ball-classification','CLEAR',0)").run(id,id,id);
  }
  db.exec("INSERT INTO campus_walk_awards (user_id,claim_number,request_id) VALUES ('owner',1,'first');INSERT INTO postgame_results (id,user_id,attempt_id,content_id,source,status,awarded) VALUES ('post','owner','post','xr-egg-trials','field','CLEAR',1)");
  const prepare=sql=>{let args=[];return {
    bind(...values){args=values;return this;},
    first(){return sql.includes("SELECT s.user_id")?{user_id:"owner",name:"Owner",expires_at:Date.now()+100000}:db.prepare(sql).get(...args)??null;},
    all(){return {results:db.prepare(sql).all(...args)};},run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};},
  };};
  const env={PUBLIC_ORIGIN:origin,DB:{prepare,batch(statements){db.exec("BEGIN");try{const results=statements.map(s=>s.run());db.exec("COMMIT");return results;}catch(error){db.exec("ROLLBACK");throw error;}}}};
  const request=(body={},headers={},method="POST")=>worker.fetch(new Request(origin+"/api/progress/reset",{
    method,headers:{Origin:origin,"Content-Type":"application/json",Cookie:"__Host-ai-change-session=test",...headers},
    ...(method==="POST"?{body:JSON.stringify(body)}:{}),
  }),env);
  return {db,request};
}

test("progress reset clears only the requesting account story/pregame progress and preserves earned rewards",async()=>{
  const {db,request}=harness();
  try {
    const before={...db.prepare("SELECT * FROM stats WHERE user_id='owner'").get()};
    for(let retry=0;retry<2;retry++){
      const response=await request();assert.equal(response.status,200);
      const result=await response.json();assert.equal(result.authenticated,true);assert.deepEqual(result.completedGameIds,[]);assert.deepEqual(result.seenStoryIds,[]);assert.equal(result.stats.hp,400);
    }
    assert.deepEqual({...db.prepare("SELECT * FROM stats WHERE user_id='owner'").get()},before);
    for(const table of ["story_progress","game_results"])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id='other'`).get().n,1);
    for(const table of ["campus_walk_awards","campus_walk_claims","postgame_results"])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id='owner'`).get().n,1);
  } finally {db.close();}
});

test("progress reset rejects guests, other origins, wrong methods and identity overrides",async()=>{
  const {db,request}=harness();
  try {
    assert.equal((await request({}, {Cookie:""})).status,401);
    assert.equal((await request({}, {Origin:"https://other.test"})).status,403);
    assert.equal((await request({}, {},"GET")).status,405);
    assert.equal((await request({userId:"other"})).status,400);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM story_progress").get().n,2);
  } finally {db.close();}
});
