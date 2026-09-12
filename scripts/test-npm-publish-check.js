#!/usr/bin/env node
const assert = require('assert')
const check = require('./npm-publish-check.js')

assert.strictEqual(check.isPublishablePath('plugin/index.js'), true)
assert.strictEqual(check.isPublishablePath('public/index.html'), true)
assert.strictEqual(check.isPublishablePath('public/jquery.min.js'), true)
assert.strictEqual(check.isPublishablePath('README.md'), false)
assert.strictEqual(check.isPublishablePath('.github/workflows/release.yml'), false)

assert.strictEqual(check.bumpPatch('0.0.10'), '0.0.11')
assert.strictEqual(check.nextPublishVersion('0.0.10', '0.0.10'), '0.0.11')
assert.strictEqual(check.nextPublishVersion('0.0.10', '0.0.11'), '0.0.12')
assert.strictEqual(check.nextPublishVersion('0.0.12', '0.0.10'), '0.0.13')

const noon = new Date('2026-09-12T12:00:00.000Z')
assert.strictEqual(
  check.alreadyPublishedToday('2026-09-12T01:00:00.000Z', noon),
  true
)
assert.strictEqual(
  check.alreadyPublishedToday('2026-09-11T23:59:59.000Z', noon),
  false
)

const skipToday = check.shouldPublish({
  now: noon,
  lastPublishTime: '2026-09-12T06:00:00.000Z',
  changedFiles: ['plugin/index.js', 'public/index.html']
})
assert.strictEqual(skipToday.publish, false)
assert.strictEqual(skipToday.reason, 'already published today')

const skipNoChange = check.shouldPublish({
  now: noon,
  lastPublishTime: '2026-09-11T16:00:00.000Z',
  changedFiles: ['README.md', '.github/workflows/release.yml']
})
assert.strictEqual(skipNoChange.publish, false)
assert.strictEqual(
  skipNoChange.reason,
  'no plugin or public updates since last publish'
)

const publish = check.shouldPublish({
  now: noon,
  lastPublishTime: '2026-09-10T22:48:14.000Z',
  changedFiles: ['plugin/index.js', 'public/jquery.min.js', 'README.md']
})
assert.strictEqual(publish.publish, true)
assert.deepStrictEqual(publish.files, [
  'plugin/index.js',
  'public/jquery.min.js'
])

const forced = check.shouldPublish({
  force: true,
  now: noon,
  lastPublishTime: '2026-09-12T06:00:00.000Z',
  changedFiles: []
})
assert.strictEqual(forced.publish, true)
assert.strictEqual(forced.reason, 'forced')

console.log('ok')
