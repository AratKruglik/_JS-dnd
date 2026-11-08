import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

test('the repo has an MIT license file and says so in the README and package.json', () => {
  const license = read('LICENSE');
  assert.match(license, /^MIT License\n/);
  assert.match(license, /Copyright \(c\) 2026 \S+/);
  assert.match(license, /Permission is hereby granted, free of charge/);
  assert.match(read('README.md'), /## License\n\n[^\n]*MIT/);
  assert.equal(JSON.parse(read('package.json')).license, 'MIT');
});
