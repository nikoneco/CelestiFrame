import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("activating CelestiFrame never deletes another application's origin-wide cache", async () => {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const current = source.match(/const CACHE_VERSION = "([^"]+)"/)[1];
  const handlers = {};
  const removed = [];
  vm.runInNewContext(source, {
    self: { addEventListener: (event, handler) => { handlers[event] = handler; }, clients: { claim: async () => {} } },
    caches: { keys: async () => [current, "celestiframe-shell-old", "another-app-cache"], delete: async (key) => { removed.push(key); } },
    URL, Set, AbortController, setTimeout, clearTimeout,
  });
  let completion;
  handlers.activate({ waitUntil: (promise) => { completion = promise; } });
  await completion;
  assert.deepEqual(removed, ["celestiframe-shell-old"]);
});

test("controlled HTML and modules use the installed release without waiting for a slow network", async () => {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const handlers = {};
  let networkRequests = 0;
  const installed = new Map([["./index.html", "installed-html"], ["https://app.invalid/js/app.js?v=1.7.0", "installed-module"]]);
  vm.runInNewContext(source, {
    self: { location: {origin:"https://app.invalid"}, addEventListener: (event, handler) => {handlers[event]=handler;} },
    caches: {open:async()=>({match:async(request)=>installed.get(request.url || request)})},
    fetch:()=>{networkRequests++;return new Promise(()=>{});},
    URL, Set, AbortController, setTimeout, clearTimeout,
  });
  for (const [request,expected] of [
    [{method:"GET",mode:"navigate",url:"https://app.invalid/?plan=1"},"installed-html"],
    [{method:"GET",destination:"script",url:"https://app.invalid/js/app.js?v=1.7.0"},"installed-module"],
  ]) {
    let result;
    handlers.fetch({request,respondWith:(promise)=>{result=promise;}});
    assert.equal(await result,expected);
  }
  assert.equal(networkRequests,0);
});
