#!/bin/bash
set -euo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO"
node test/pomodoro-test.js
for script in test/*.sh; do bash -n "$script"; done
if command -v shellcheck >/dev/null; then shellcheck test/*.sh; fi
node - <<'JS'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'))
assert.equal(manifest.id, 'pomodoro')
assert.equal(manifest.apiVersion, 1)
assert.equal(manifest.schemaVersion, 1)
assert.deepEqual(manifest.panelAliases, ['pomodoro'])
assert.equal(manifest.dependencies, undefined)
assert.equal(manifest.lifecycle, undefined)
for (const path of Object.values(manifest.entryPoints)) assert.ok(fs.statSync(path).isFile())
console.log('ok - manifest contract')
JS
if [[ -n ${HYPRSIMPLE_SOURCE:-} ]]; then
  bash test/integration-test.sh
else
  echo 'Integration omitted: set HYPRSIMPLE_SOURCE to a Hyprsimple checkout with Quickshell installed.'
fi
