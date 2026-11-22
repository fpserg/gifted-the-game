const assert = require('node:assert/strict');
const fs = require('node:fs');

for (const name of ['menu-game-v2.webp', 'menu-tutorial-v2.webp']) {
  const path = `assets/ui/${name}`;
  const data = fs.readFileSync(path);
  assert.equal(data.toString('ascii', 0, 4), 'RIFF', `${path}: missing RIFF signature`);
  assert.equal(data.toString('ascii', 8, 12), 'WEBP', `${path}: missing WEBP signature`);
  assert.equal(data.toString('ascii', 12, 16), 'VP8X', `${path}: expected extended WebP`);
  assert.equal(1 + data.readUIntLE(24, 3), 1254, `${path}: unexpected width`);
  assert.equal(1 + data.readUIntLE(27, 3), 1254, `${path}: unexpected height`);
}
console.log('PASS: both menu medallions are valid 1254x1254 extended WebP files');