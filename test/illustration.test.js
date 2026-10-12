import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const regions=JSON.parse(readFileSync(new URL("../public/data/illustrated-regions.json",import.meta.url),"utf8"));
const towns=JSON.parse(readFileSync(new URL("../public/data/towns.json",import.meta.url),"utf8"));

test("illustrated map matches the known artboard",()=>{
  assert.deepEqual(regions.viewBox,[1086,1448]);
  assert.equal(Object.keys(regions.regions).length,15);
  for(const [county,path] of Object.entries(regions.regions)){
    assert.ok(towns[county], "Unknown county: "+county);
    assert.match(path,/^M\d+,\d+L/);
    assert.ok(path.endsWith("Z"));
    const points=[...path.matchAll(/(\d+),(\d+)/g)].map(x=>[Number(x[1]),Number(x[2])]);
    assert.ok(points.length>20,county+" border too coarse");
    assert.ok(points.every(([x,y])=>x>=0&&x<=1086&&y>=0&&y<=1448),county+" out of bounds");
  }
});

test("all mainland cities are reachable via illustrated area or grouped selector",()=>{
  const regionsOnMap=Object.keys(regions.regions);
  const aliases=["新北市","基隆市","新竹市","嘉義市"];
  const mainland=Object.keys(towns).filter(name=>!["澎湖縣","金門縣","連江縣"].includes(name));
  assert.deepEqual(mainland.filter(name=>!regionsOnMap.includes(name)).sort(),aliases.sort());
});
