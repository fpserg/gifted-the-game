// Run: node scripts/check-pwa-navigation-cache.cjs
// No dependencies. Executes the actual service worker in an isolated VM.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('service-worker.js', 'utf8');
const SCOPE = 'https://example.test/gifted-the-game/';
const INDEX = './index.html';
const shell = label => '<!doctype html><div id="app"></div><script src="tutorial.js"></script><script src="game.js"></script>' + label;
const cacheName = source.match(/const CACHE_NAME = '([^']+)'/)?.[1];
assert.equal(cacheName, 'game-of-gifts-v10-nav-cache-guard');

class Response {
  constructor(body = '', { status = 200, contentType = 'text/html' } = {}) {
    this.body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.headers = { get: name => name.toLowerCase() === 'content-type' ? contentType : null };
  }
  clone() { return new Response(this.body, { status: this.status, contentType: this.headers.get('content-type') }); }
  async text() { return this.body; }
  static error() { return new Response('', { status: 0, contentType: null }); }
}
class Request {
  constructor(path = '', mode = 'navigate') {
    this.url = new URL(path, SCOPE).href;
    this.mode = mode;
    this.method = 'GET';
  }
}
// Cache keys use fully resolved Request URLs, as in CacheStorage.
function keyOf(request) {
  return new URL(typeof request === 'string' ? request : request.url, SCOPE).href;
}
function harness({ online = new Response(shell('NEW INDEX')), oldCaches = {} } = {}) {
  const listeners = {}, data = new Map(), calls = [], operations = [];
  const lifecycle = { installed: false, activated: false, skipWaiting: 0, claims: 0 };
  let fetchValue = online;
  for (const [name, values] of Object.entries(oldCaches)) {
    data.set(name, new Map(Object.entries(values).map(([key, response]) => [keyOf(key), response.clone()])));
  }
  const store = name => {
    if (!data.has(name)) data.set(name, new Map());
    const map = data.get(name);
    return {
      async put(key, value) { operations.push({ type: 'put', cache: name, key: keyOf(key) }); map.set(keyOf(key), value.clone()); },
      async match(key) { return map.get(keyOf(key))?.clone(); },
      // Unlike the old fake addAll, fetch every resource from the simulated network.
      // Sequential writes deliberately model a partial install in the worst case:
      // rejecting installation must clean it even if an implementation wrote early.
      async addAll(paths) {
        for (const path of paths) {
          const response = await fetch(new Request(path, 'same-origin'));
          if (!response.ok) throw new TypeError('Cache.addAll failed: ' + path);
          await this.put(path, response);
        }
      }
    };
  };
  const caches = {
    open: async name => store(name),
    match: async (key, options = {}) => {
      const names = options.cacheName ? [options.cacheName] : [...data.keys()];
      for (const name of names) {
        const value = data.get(name)?.get(keyOf(key));
        if (value) return value.clone();
      }
    },
    keys: async () => [...data.keys()],
    delete: async name => { operations.push({ type: 'delete', cache: name }); return data.delete(name); }
  };
  const self = {
    location: { origin: 'https://example.test' },
    registration: { scope: SCOPE },
    addEventListener: (type, listener) => listeners[type] = listener,
    skipWaiting: async () => { lifecycle.skipWaiting++; },
    clients: { claim: async () => { lifecycle.claims++; } }
  };
  const fetch = async (request, options) => {
    calls.push({ url: request.url, options });
    const response = typeof fetchValue === 'function' ? await fetchValue(request, options) : fetchValue;
    if (response instanceof Error) throw response;
    return response.clone();
  };
  vm.runInNewContext(source, { self, caches, fetch, URL, Response, Request, Promise, Array });
  async function fire(type, request) {
    let outcome;
    const pending = [];
    listeners[type]({
      request,
      respondWith: value => outcome = Promise.resolve(value),
      waitUntil: value => pending.push(Promise.resolve(value))
    });
    const response = outcome && await outcome;
    await Promise.all(pending);
    return response;
  }
  return {
    caches, calls, data, lifecycle, operations,
    setNetwork: value => { fetchValue = value; },
    fire, navigate: (path = '') => fire('fetch', new Request(path)),
    asset: path => fire('fetch', new Request(path, 'no-cors')),
    cached: (name = cacheName, key = INDEX) => data.get(name)?.get(keyOf(key)),
    seed: (name, key, value) => store(name).put(key, value),
    async install() {
      try { await fire('install'); lifecycle.installed = true; }
      catch (error) { lifecycle.installed = false; throw error; }
    },
    async activate() {
      // Browser lifecycle: failed install cannot promote the new worker.
      if (!lifecycle.installed) throw new Error('Cannot activate rejected worker');
      await fire('activate'); lifecycle.activated = true;
    }
  };
}

// Network responses for installation: both entries are genuine application HTML,
// other URLs receive resource content. No cache entry is supplied by the test harness.
function installResponse(overrides = {}) {
  return request => {
    const path = new URL(request.url).pathname.slice(new URL(SCOPE).pathname.length);
    const key = path === '' ? './' : './' + path;
    if (Object.hasOwn(overrides, key)) return overrides[key];
    return key === './' || key === INDEX
      ? new Response(shell('NEW INSTALL SHELL'))
      : new Response('ASSET', { contentType: 'application/octet-stream' });
  };
}

(async () => {
  let checks = 0;
  const test = async (id, callback) => {
    await callback();
    checks++;
    console.log('PASS ' + id);
  };
  const valid = () => new Response(shell('VALID OFFLINE SHELL'));

  await test('T1 HTTP 200 caches successful entry HTML and returns network', async () => {
    const h = harness({ online: new Response(shell('FRESH SHELL')) });
    const response = await h.navigate('');
    assert.equal(response.status, 200);
    assert.equal(response.body, shell('FRESH SHELL'));
    assert.equal(h.cached().body, shell('FRESH SHELL'));
  });
  for (const status of [503, 404]) {
    await test(status === 503 ? 'T2 HTTP 503 preserves fallback' : 'T3 HTTP 404 preserves fallback', async () => {
      const h = harness({ online: new Response('HTTP ERROR', { status }) });
      await h.seed(cacheName, INDEX, valid());
      const response = await h.navigate('index.html');
      assert.equal(response.status, 200);
      assert.equal(response.body, shell('VALID OFFLINE SHELL'));
      assert.equal(h.cached().body, shell('VALID OFFLINE SHELL'));
    });
  }
  await test('T4 network exception uses cached valid HTML', async () => {
    const h = harness({ online: new Error('offline') });
    await h.seed(cacheName, INDEX, valid());
    const response = await h.navigate('');
    assert.equal(response.status, 200);
    assert.equal(response.body, shell('VALID OFFLINE SHELL'));
  });
  await test('T5 no cache returns HTTP failure or Response.error without poisoning', async () => {
    const h = harness({ online: new Response('NO SERVICE', { status: 503 }) });
    assert.equal((await h.navigate('')).status, 503);
    assert.equal(h.cached(), undefined);
    h.setNetwork(new Error('offline'));
    const response = await h.navigate('');
    assert.equal(response.status, 0);
    assert.equal(h.cached(), undefined);
  });
  await test('T6 offline after server error still returns unchanged valid shell', async () => {
    const h = harness({ online: new Response('SERVER FAIL', { status: 503 }) });
    await h.seed(cacheName, INDEX, valid());
    await h.navigate('');
    h.setNetwork(new Error('offline'));
    const response = await h.navigate('');
    assert.equal(response.body, shell('VALID OFFLINE SHELL'));
    assert.equal(h.cached().body, shell('VALID OFFLINE SHELL'));
  });
  await test('T7 new cache install and activation discard poisoned v9', async () => {
    const oldName = 'game-of-gifts-v9-tutorial-ring';
    const h = harness({ oldCaches: { [oldName]: { [INDEX]: new Response('OLD 200 ERROR PAGE') } }, online: installResponse() });
    await h.install();
    assert.equal(h.cached(cacheName).body, shell('NEW INSTALL SHELL'));
    assert.equal(h.cached(cacheName, './').body, shell('NEW INSTALL SHELL'));
    await h.activate();
    assert.equal(h.data.has(oldName), false);
    h.setNetwork(new Error('offline'));
    assert.equal((await h.navigate('')).body, shell('NEW INSTALL SHELL'));
  });
  await test('T8 ordinary non-navigation assets retain cache-first behavior', async () => {
    const h = harness({ online: new Response('NETWORK CSS', { contentType: 'text/css' }) });
    const path = new Request('styles.css', 'no-cors');
    await h.seed(cacheName, path.url, new Response('CACHED CSS', { contentType: 'text/css' }));
    const response = await h.asset('styles.css');
    assert.equal(response.body, 'CACHED CSS');
    assert.equal(h.calls.length, 0);
  });
  await test('T9 unrelated navigation cannot overwrite entry HTML', async () => {
    const h = harness({ online: new Response('OTHER HTML') });
    await h.seed(cacheName, INDEX, valid());
    const response = await h.navigate('unrelated.html');
    assert.equal(response.body, 'OTHER HTML');
    assert.equal(h.cached().body, shell('VALID OFFLINE SHELL'));
    h.setNetwork(new Response('404', { status: 404 }));
    assert.equal((await h.navigate('unrelated.html')).status, 404);
    assert.equal(h.cached().body, shell('VALID OFFLINE SHELL'));
  });
  await test('T10 reject cached 200 non-HTML and network 200 non-HTML for entry', async () => {
    const h = harness({ online: new Response('TEXT', { contentType: 'text/plain' }) });
    await h.seed(cacheName, INDEX, new Response('NOT HTML', { contentType: 'text/plain' }));
    assert.equal((await h.navigate('')).body, 'TEXT');
    assert.equal(h.cached().body, 'NOT HTML');
    h.setNetwork(new Error('offline'));
    assert.equal((await h.navigate('')).status, 0);
  });
  await test('T11 image menu network-first HTTP fallback unchanged', async () => {
    const h = harness({ online: new Response('503', { status: 503, contentType: 'image/webp' }) });
    const path = new Request('assets/ui/menu-game-v2.webp', 'no-cors');
    await h.seed(cacheName, path.url, new Response('CACHED MEDALLION', { contentType: 'image/webp' }));
    const response = await h.asset('assets/ui/menu-game-v2.webp');
    assert.equal(response.body, 'CACHED MEDALLION');
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].options)), { cache: 'reload' });
  });
  await test('T12 reject HTTP 200 HTML error bodies, including poisoned cache', async () => {
    const h = harness({ online: new Response('200 ERROR PAGE') });
    await h.seed(cacheName, INDEX, new Response('POISONED 200 HTML'));
    assert.equal((await h.navigate('')).body, '200 ERROR PAGE');
    assert.equal(h.cached().body, 'POISONED 200 HTML');
    h.setNetwork(new Error('offline'));
    assert.equal((await h.navigate('')).status, 0, 'do not serve a 200 HTML error as app');
    // Once the real application responds, cache heals.
    h.setNetwork(new Response(shell('RECOVERED')));
    assert.equal((await h.navigate('')).body, shell('RECOVERED'));
    assert.equal(h.cached().body, shell('RECOVERED'));
  });
  const oldName = 'game-of-gifts-v9-tutorial-ring';
  const withOld = online => harness({
    online,
    oldCaches: { [oldName]: { [INDEX]: new Response(shell('PREVIOUS VALID SHELL')) } }
  });
  const oldPreserved = h => {
    assert.equal(h.cached(oldName).body, shell('PREVIOUS VALID SHELL'));
    assert.equal(h.data.has(cacheName), false, 'new partial cache must be removed');
    assert.equal(h.lifecycle.skipWaiting, 0, 'skipWaiting must not run');
    assert.equal(h.lifecycle.installed, false);
    assert.equal(h.lifecycle.activated, false);
    assert.equal(h.lifecycle.claims, 0);
  };

  await test('T13 valid upgrade installs both fetched HTML entries and activates safely', async () => {
    const h = withOld(installResponse());
    await h.install();
    assert.equal(h.lifecycle.installed, true);
    assert.equal(h.lifecycle.skipWaiting, 1);
    assert.equal(h.cached(cacheName, './').body, shell('NEW INSTALL SHELL'));
    assert.equal(h.cached(cacheName, INDEX).body, shell('NEW INSTALL SHELL'));
    assert.equal(h.calls.filter(x => x.url === new URL('./', SCOPE).href).length, 1, 'root fetched exactly once');
    assert.equal(h.calls.filter(x => x.url === new URL(INDEX, SCOPE).href).length, 1, 'index fetched exactly once');
    assert(h.calls.length > 50, 'app resources must be loaded, not directly seeded');
    assert.equal(h.cached(oldName).body, shell('PREVIOUS VALID SHELL'), 'old cache retained before activation');
    await h.activate();
    assert.equal(h.lifecycle.activated, true);
    assert.equal(h.lifecycle.claims, 1);
    assert.equal(h.data.has(oldName), false);
    h.setNetwork(new Error('offline'));
    assert.equal((await h.navigate('')).body, shell('NEW INSTALL SHELL'));
  });
  await test('T14 HTTP 200 error document rejects install, keeps v9 intact', async () => {
    const h = withOld(installResponse({
      './': new Response('MAINTENANCE ERROR 200'),
      [INDEX]: new Response('MAINTENANCE ERROR 200')
    }));
    await assert.rejects(h.install(), /Invalid application shell during PWA install/);
    oldPreserved(h);
    assert(h.operations.some(x => x.type === 'put' && x.cache === cacheName), 'bad entries really reached temporary cache');
    assert(h.operations.some(x => x.type === 'delete' && x.cache === cacheName));
    await assert.rejects(h.activate(), /Cannot activate rejected worker/);
    assert.equal(h.cached(oldName).body, shell('PREVIOUS VALID SHELL'));
  });
  await test('T15 valid index but invalid root rejects installation', async () => {
    const h = withOld(installResponse({
      './': new Response('200 TECHNICAL ERROR ROOT'),
      [INDEX]: new Response(shell('VALID INDEX'))
    }));
    await assert.rejects(h.install(), /Invalid application shell during PWA install: \.\//);
    oldPreserved(h);
  });
  await test('T16 valid root but invalid index rejects installation', async () => {
    const h = withOld(installResponse({
      './': new Response(shell('VALID ROOT')),
      [INDEX]: new Response('200 TECHNICAL ERROR INDEX')
    }));
    await assert.rejects(h.install(), /Invalid application shell during PWA install: \.\/index\.html/);
    oldPreserved(h);
  });
  await test('T17 partial installation failure deletes v10 without touching v9', async () => {
    const h = withOld(installResponse({
      './assets/locations/loc_well.webp': new Response('BAD RESOURCE', { status: 503, contentType: 'image/webp' })
    }));
    await assert.rejects(h.install(), /Cache\.addAll failed/);
    assert(h.operations.filter(x => x.type === 'put' && x.cache === cacheName).length > 10, 'some resources must be written before rejection');
    assert(h.operations.some(x => x.type === 'delete' && x.cache === cacheName));
    oldPreserved(h);
    await assert.rejects(h.activate(), /Cannot activate rejected worker/);
  });
  await test('T18 rejected update leaves previous offline app available', async () => {
    const h = withOld(installResponse({ [INDEX]: new Response('BAD 200 INDEX') }));
    await assert.rejects(h.install(), /Invalid application shell/);
    oldPreserved(h);
    h.setNetwork(new Error('offline'));
    // Simulate the still-active v9 worker reading *its* untouched cache.
    // Rejected v10 never receives a fetch event from the browser.
    const cachedOldShell = await h.caches.match(INDEX, { cacheName: oldName });
    assert.equal(cachedOldShell.status, 200);
    assert.equal(cachedOldShell.body, shell('PREVIOUS VALID SHELL'));
    assert.equal(h.data.has(cacheName), false);
  });
  console.log('PASS: ' + checks + ' PWA navigation/cache regression cases');
})().catch(error => { console.error(error); process.exitCode = 1; });
