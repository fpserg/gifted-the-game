// Run: node scripts/check-pwa-navigation-cache.cjs
// No dependencies. Executes the actual service worker in an isolated VM.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('service-worker.js', 'utf8');
const SCOPE = 'https://example.test/gifted-the-game/';
const INDEX = './index.html';
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
  static error() { return new Response('', { status: 0, contentType: null }); }
}
class Request {
  constructor(path = '', mode = 'navigate') {
    this.url = new URL(path, SCOPE).href;
    this.mode = mode;
    this.method = 'GET';
  }
}
function harness({ online = new Response('NEW INDEX'), oldCaches = {} } = {}) {
  const listeners = {}, data = new Map(), calls = [];
  let fetchValue = online;
  for (const [name, values] of Object.entries(oldCaches)) {
    data.set(name, new Map(Object.entries(values)));
  }
  const store = name => {
    if (!data.has(name)) data.set(name, new Map());
    const map = data.get(name);
    return {
      async put(key, value) { map.set(typeof key === 'string' ? key : key.url, value.clone()); },
      async match(key) { return map.get(typeof key === 'string' ? key : key.url); },
      async addAll(paths) {
        for (const path of paths) {
          map.set(path, path === INDEX ? new Response('NEW INSTALL SHELL') : new Response('ASSET', { contentType: 'image/webp' }));
        }
      }
    };
  };
  const caches = {
    open: async name => store(name),
    match: async (key, options = {}) => {
      const names = options.cacheName ? [options.cacheName] : [...data.keys()];
      for (const name of names) {
        const value = data.get(name)?.get(typeof key === 'string' ? key : key.url);
        if (value) return value.clone();
      }
    },
    keys: async () => [...data.keys()],
    delete: async name => data.delete(name)
  };
  const self = {
    location: { origin: 'https://example.test' },
    registration: { scope: SCOPE },
    addEventListener: (type, listener) => listeners[type] = listener,
    skipWaiting: async () => {},
    clients: { claim: async () => {} }
  };
  const fetch = async (request, options) => {
    calls.push({ url: request.url, options });
    if (fetchValue instanceof Error) throw fetchValue;
    return fetchValue.clone();
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
    caches, calls, data,
    setNetwork: value => { fetchValue = value; },
    fire, navigate: (path = '') => fire('fetch', new Request(path)),
    asset: path => fire('fetch', new Request(path, 'no-cors')),
    cached: (name = cacheName, key = INDEX) => data.get(name)?.get(key),
    seed: (name, key, value) => store(name).put(key, value),
    install: () => fire('install'),
    activate: () => fire('activate')
  };
}

(async () => {
  let checks = 0;
  const test = async (id, callback) => {
    await callback();
    checks++;
    console.log('PASS ' + id);
  };
  const valid = () => new Response('VALID OFFLINE SHELL');

  await test('T1 HTTP 200 caches successful entry HTML and returns network', async () => {
    const h = harness({ online: new Response('FRESH SHELL') });
    const response = await h.navigate('');
    assert.equal(response.status, 200);
    assert.equal(response.body, 'FRESH SHELL');
    assert.equal(h.cached().body, 'FRESH SHELL');
  });
  for (const status of [503, 404]) {
    await test(status === 503 ? 'T2 HTTP 503 preserves fallback' : 'T3 HTTP 404 preserves fallback', async () => {
      const h = harness({ online: new Response('HTTP ERROR', { status }) });
      await h.seed(cacheName, INDEX, valid());
      const response = await h.navigate('index.html');
      assert.equal(response.status, 200);
      assert.equal(response.body, 'VALID OFFLINE SHELL');
      assert.equal(h.cached().body, 'VALID OFFLINE SHELL');
    });
  }
  await test('T4 network exception uses cached valid HTML', async () => {
    const h = harness({ online: new Error('offline') });
    await h.seed(cacheName, INDEX, valid());
    const response = await h.navigate('');
    assert.equal(response.status, 200);
    assert.equal(response.body, 'VALID OFFLINE SHELL');
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
    assert.equal(response.body, 'VALID OFFLINE SHELL');
    assert.equal(h.cached().body, 'VALID OFFLINE SHELL');
  });
  await test('T7 new cache install and activation discard poisoned v9', async () => {
    const oldName = 'game-of-gifts-v9-tutorial-ring';
    const h = harness({ oldCaches: { [oldName]: { [INDEX]: new Response('OLD 200 ERROR PAGE') } }, online: new Error('offline') });
    await h.install();
    assert.equal(h.cached(cacheName).body, 'NEW INSTALL SHELL');
    await h.activate();
    assert.equal(h.data.has(oldName), false);
    assert.equal((await h.navigate('')).body, 'NEW INSTALL SHELL');
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
    assert.equal(h.cached().body, 'VALID OFFLINE SHELL');
    h.setNetwork(new Response('404', { status: 404 }));
    assert.equal((await h.navigate('unrelated.html')).status, 404);
    assert.equal(h.cached().body, 'VALID OFFLINE SHELL');
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
  console.log('PASS: ' + checks + ' PWA navigation/cache regression cases');
})().catch(error => { console.error(error); process.exitCode = 1; });
