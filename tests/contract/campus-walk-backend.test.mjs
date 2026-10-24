import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read=path=>readFile(new URL(`../../backend/${path}`,import.meta.url),"utf8");
const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source,{mode:"transform"})).toString("base64")}`;
let source=(await read("src/index.ts")).replace(/^export \{ PostgameCoordinator \} from "\.\/postgame-coordinator";\s*/u,"");
for(const name of ["progression","wishes"])source=source.replace(`"./${name}"`,JSON.stringify(moduleUrl(await read(`src/${name}.ts`))));
const worker=(await import(moduleUrl(source))).default;
const schema=await read("schema.sql"),migration=await read("migrations/0016_campus_walk_three_claims.sql");
const origin="https://game.example.test";

function harness() {
  const db=new DatabaseSync(":memory:");db.exec(schema);
  for(const id of ["walker","other"]){db.prepare("INSERT INTO users (id,email) VALUES (?,?)").run(id,`${id}@example.test`);db.prepare("INSERT INTO stats (user_id) VALUES (?)").run(id);}
  let user="walker";
  const env={PUBLIC_ORIGIN:origin,DB:{prepare(sql){let args=[];return {
    bind(...values){args=values;return this;},
    first(){return sql.includes("SELECT s.user_id")?{user_id:user,name:"Walker",expires_at:Date.now()+100000}:db.prepare(sql).get(...args)??null;},
    run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};},
  };}}};
  const request=(body={requestId:crypto.randomUUID()},headers={},method="POST")=>worker.fetch(new Request(origin+"/api/campus/engineering-walk",{
    method,headers:{Origin:origin,"Content-Type":"application/json",Cookie:"__Host-ai-change-session=test-session",...headers},
    ...(method==="POST"?{body:JSON.stringify(body)}:{}),
  }),env);
  return {db,request,setUser:id=>{user=id;}};
}

test("engineering walks award +1 health per distinct climb, cap each account at three, and ignore retries",async()=>{
  const {db,request,setUser}=harness();
  try {
    const id=crypto.randomUUID();let result=await (await request({requestId:id})).json();
    assert.equal(result.awarded,true);assert.equal(result.stats.hp,200);assert.equal(result.remainingClaims,2);
    result=await (await request({requestId:id})).json();assert.equal(result.awarded,false);assert.equal(result.stats.hp,200);assert.equal(result.claimsUsed,1);
    const responses=await Promise.all(Array.from({length:8},()=>request()));
    const values=await Promise.all(responses.map(r=>r.json()));assert.equal(values.filter(r=>r.awarded).length,2);
    result=await (await request()).json();assert.equal(result.awarded,false);assert.equal(result.claimsUsed,3);assert.equal(result.remainingClaims,0);assert.equal(result.stats.hp,400);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM campus_walk_awards WHERE user_id='walker'").get().n,3);
    setUser("other");result=await (await request({requestId:id})).json();assert.equal(result.awarded,true);assert.equal(result.stats.hp,200);assert.equal(result.claimsUsed,1);
  } finally {db.close();}
});

test("engineering rewards require the signed-in account, same origin, and a valid retry id",async()=>{
  const {db,request}=harness();
  try {
    assert.equal((await request(undefined,{Cookie:""})).status,401);
    assert.equal((await request(undefined,{Origin:"https://other.test"})).status,403);
    assert.equal((await request(undefined,{},"GET")).status,405);
    for(const body of [{},{requestId:"bad"},{requestId:crypto.randomUUID(),userId:"other"}])assert.equal((await request(body)).status,400);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM campus_walk_awards").get().n,0);
    assert.equal(db.prepare("SELECT hp FROM stats WHERE user_id='walker'").get().hp,100);
  } finally {db.close();}
});

test("the three-claim migration preserves an old reward without granting HP again",async()=>{
  const db=new DatabaseSync(":memory:");
  try {
    const names=(await readdir(new URL("../../backend/migrations/",import.meta.url))).filter(n=>n.endsWith(".sql")&&n<"0016").sort();
    for(const name of names)db.exec(await read(`migrations/${name}`));
    db.exec("INSERT INTO users (id,email) VALUES ('legacy','legacy@example.test');INSERT INTO stats (user_id,hp) VALUES ('legacy',110);INSERT INTO campus_walk_claims (user_id) VALUES ('legacy');");
    db.exec(migration);
    assert.equal(db.prepare("SELECT hp FROM stats WHERE user_id='legacy'").get().hp,110);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM campus_walk_awards WHERE user_id='legacy'").get().n,1);
    db.exec("INSERT INTO users (id,email) VALUES ('late','late@example.test');INSERT INTO stats (user_id,hp) VALUES ('late',110);INSERT INTO campus_walk_claims (user_id) VALUES ('late');");
    assert.equal(db.prepare("SELECT hp FROM stats WHERE user_id='late'").get().hp,110,"old requests during rollout do not receive the new trigger reward");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM campus_walk_awards WHERE user_id='late'").get().n,1);
    db.exec("DELETE FROM users WHERE id='late'");
    db.exec("INSERT INTO campus_walk_awards (user_id,claim_number,request_id) VALUES ('legacy',2,'second'),('legacy',3,'third');");
    assert.equal(db.prepare("SELECT hp FROM stats WHERE user_id='legacy'").get().hp,310);
    assert.throws(()=>db.exec("INSERT INTO campus_walk_awards VALUES ('legacy',4,'fourth',CURRENT_TIMESTAMP)"),/CHECK/u);
    db.exec("DELETE FROM users WHERE id='legacy'");assert.equal(db.prepare("SELECT COUNT(*) AS n FROM campus_walk_awards").get().n,0);
  } finally {db.close();}
});
