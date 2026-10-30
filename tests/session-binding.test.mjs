import assert from 'node:assert/strict'
import { test } from 'node:test'

import { find, loadPlugin } from './load-plugin.mjs'
import * as react from './stubs/react.mjs'
import * as sdk from './stubs/plugin-sdk.mjs'

const FILE = '/tmp/redline-session.md'
const DOC = '# Review\n\nParagraph.\n'
const openAnnotation = { id: 'a1', kind: 'comment', block: 1, quote: 'Paragraph.', note: 'Check this.', status: 'open' }

async function mount({ sessionId, items = [openAnnotation] } = {}) {
  sdk.__reset()
  react.__reset()
  sdk.__setQueryResult('redline:doc', { content: DOC })
  sdk.__setQueryResult('redline:ann', { items })
  globalThis.document ??= { createElement: () => ({ remove() {} }), head: { appendChild() {} } }

  let entries = []
  const saves = []
  const plugin = await loadPlugin()
  plugin.default.register({
    rest: async (...args) => { saves.push(args); return {} },
    storage: { get: () => [], set() {} },
    onDispose() {},
    registerMany(next) { entries = next },
  })
  const directive = entries.find((entry) => entry.id === 'directive')
  const card = directive.data.render({ attrs: { file: FILE }, sessionId })
  const [open] = find(card, (node) => node.type === sdk.Button && node.props.children === 'Review in Redline')
  open.props.onClick()
  const pane = sdk.host.workspaces.at(-1).render()
  const render = () => { react.__beginRender(); return pane.type(pane.props) }
  return { render, saves, pane }
}

function sendBatch(render) {
  const [button] = find(render(), (node) => node.type === sdk.Button && String(node.props.children).startsWith('Send '))
  button.props.onClick()
}

test('a Redline card binds batch delivery to its opening session', async () => {
  const { render, pane } = await mount({ sessionId: 'session-A' })
  assert.equal(pane.key, `${FILE}:session-A`, 'workspace render key includes the target session')
  sdk.host.focusedSessionId = 'session-B'
  sendBatch(render)
  assert.equal(sdk.host.submissions.length, 1)
  assert.equal(sdk.host.submissions[0].sessionId, 'session-A')
})

test('a detached pane refuses to send without saving annotation status', async () => {
  const { render, saves } = await mount({ sessionId: undefined })
  sendBatch(render)
  assert.equal(sdk.host.submissions.length, 0)
  assert.equal(saves.length, 0)
  assert.match(sdk.host.errors.at(-1), /detached.*reopen.*target chat/i)
})

test('an unavailable target leaves annotations unsent', async () => {
  const { render, saves } = await mount({ sessionId: 'closed-session' })
  sdk.host.submitResult = false
  sendBatch(render)
  assert.equal(sdk.host.submissions.length, 1)
  assert.equal(saves.length, 0)
  assert.match(sdk.host.errors.at(-1), /target chat is unavailable.*remain unsent/i)
})
