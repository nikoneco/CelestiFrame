import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("installing a release bypasses fresh but older HTML and fonts in the HTTP cache", async () => {
  const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
  const handlers = {};
  const installed = new Map();
  class WorkerRequest extends Request {
    constructor(url, options) { super(new URL(url, "https://app.invalid/"), options); }
  }
  vm.runInNewContext(source, {
    self: { addEventListener: (event, handler) => { handlers[event] = handler; } },
    caches: { open: async () => ({
      addAll: async (requests) => {
        for (const input of requests) {
          const request = input instanceof Request ? input : new WorkerRequest(input);
          // The browser may retain the previous deployment for its full max-age.
          installed.set(new URL(request.url).pathname,
            request.cache === "reload" ? "current-release" : "cached-previous-release");
        }
      },
      put: async () => {},
    }) },
    fetch: async () => ({ ok: false }),
    Request: WorkerRequest, URL, Set, AbortController, setTimeout, clearTimeout,
  });
  let completion;
  handlers.install({ waitUntil: (promise) => { completion = promise; } });
  await completion;
  assert.equal(installed.get("/index.html"), "current-release");
  assert.equal(installed.get("/assets/fonts/IBMPlexSansJP-Regular-ui.woff2"), "current-release");
});

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
