// The review pane gives every annotation a marker in the margin. Two annotations on the same
// paragraph used to land on the same pixel: only the last one stayed clickable, so the earlier
// threads could not be reopened, sent, resolved or removed. These tests pin the contract that the
// README states ("one annotation card open at a time, click a margin marker to switch").
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { find, loadPlugin, unsupportedSpecifiers } from './load-plugin.mjs'
import * as react from './stubs/react.mjs'
import * as sdk from './stubs/plugin-sdk.mjs'

const DOC = '# Review\n\nFirst paragraph.\n\nSecond paragraph.\n'
const FILE = '/tmp/redline-fixture.md'

const thread = (id, block, note) => ({ id, kind: 'comment', block, quote: `q-${id}`, note, status: 'open' })

/** Register the plugin, walk the directive card, open the pane and return a render function. */
async function mount(items) {
  sdk.__reset()
  react.__reset()
  sdk.__setQueryResult('redline:doc', { content: DOC })
  sdk.__setQueryResult('redline:ann', { items })
  globalThis.document ??= {
    createElement: () => ({ remove() {} }),
    head: { appendChild() {} },
  }

  let registered = []
  const plugin = await loadPlugin()
  plugin.default.register({
    rest: async () => ({}),
    storage: { get: () => [], set() {} },
    onDispose() {},
    registerMany(entries) {
      registered = entries
    },
  })

  const directive = registered.find((entry) => entry.id === 'directive')
  const card = directive.data.render({ attrs: { file: FILE } })
  const [open] = find(card, (node) => node.type === sdk.Button)
  open.props.onClick() // "Review in Redline" opens the pane
  const pane = sdk.host.workspaces.at(-1).render()

  return () => {
    react.__beginRender()
    return pane.type(pane.props)
  }
}

const markers = (tree) =>
  find(tree, (node) => node.type === 'button' && String(node.props.className ?? '').startsWith('rl-marker'))

const markersOfBlock = (tree, block) =>
  find(tree, (node) => node.props['data-rl-block'] === String(block)).flatMap((node) => markers(node.props.children))

const slots = (found) => found.map((node) => node.props.style?.top)

test('one marker per annotation, each in its own margin slot', async () => {
  const render = await mount([thread('a1', 1, 'one'), thread('a2', 1, 'two'), thread('a3', 1, 'three')])
  const found = markers(render())
  assert.equal(found.length, 3, 'every annotation keeps a marker')

  const tops = slots(found)
  assert.equal(
    new Set(tops).size,
    tops.length,
    `markers on one block must not share a position, got ${JSON.stringify(tops)}`,
  )

  const offsets = tops.map((top) => Number.parseFloat(top))
  assert.ok(offsets.every(Number.isFinite), `every marker needs a numeric offset, got ${JSON.stringify(tops)}`)
  for (let i = 1; i < offsets.length; i += 1) {
    // The marker box is 20px (.rl-marker), so a smaller gap between slots means the boxes overlap.
    assert.ok(
      offsets[i] - offsets[i - 1] >= 20,
      `stacked markers must clear the 20px marker box, got ${JSON.stringify(tops)}`,
    )
  }
})

test('markers stack per block, not across the document', async () => {
  const render = await mount([thread('a1', 1, 'one'), thread('a2', 1, 'two'), thread('b1', 2, 'other')])
  const tree = render()

  const first = slots(markersOfBlock(tree, 1)).map((top) => Number.parseFloat(top))
  const second = slots(markersOfBlock(tree, 2)).map((top) => Number.parseFloat(top))

  assert.equal(first.length, 2)
  assert.equal(second.length, 1)
  assert.equal(second[0], first[0], 'a block with one annotation still starts at the first slot')
  assert.ok(first[1] > first[0], 'the second annotation on a block sits below the first')
})

test('clicking a marker opens that annotation, beside its own slot', async () => {
  const render = await mount([thread('a1', 1, 'one'), thread('a2', 1, 'two'), thread('a3', 1, 'three')])
  markers(render())[2].props.onClick() // switch to the third thread, the one that used to be buried
  const tree = render()

  const [card] = find(tree, (node) => node.props?.style?.position === 'absolute')
  assert.ok(card, 'clicking a marker opens its card')
  assert.equal(card.props.children.props.a.id, 'a3', 'the third annotation is the one opened')

  const own = Number.parseFloat(slots(markers(tree))[2])
  assert.equal(
    Number.parseFloat(card.props.style.top),
    react.BLOCK_TOP + own,
    'the card drops to the offset of the marker it belongs to instead of sitting on the block top',
  )
})

test('the card shows what the agent did about a resolved thread', async () => {
  const render = await mount([
    { ...thread('a1', 1, 'one'), status: 'resolved', action: 'Rewrote the paragraph and merged the two bullets.' },
  ])
  markers(render())[0].props.onClick() // open the thread
  const tree = render()

  const [marker] = markers(tree)
  assert.equal(marker.props.children, '✓', 'the margin marker becomes a tick')

  // The card is a child component: the tree walk stops at its element, so render it as React would.
  const [wrapper] = find(tree, (node) => node.props?.style?.position === 'absolute')
  assert.ok(wrapper, 'the card is open')
  const card = wrapper.props.children
  const [action] = find(card.type(card.props), (node) => node.props.className === 'rl-action')
  assert.ok(action, 'the action line is rendered')
  assert.match(String(action.props.children), /Rewrote the paragraph/)
})

test('a resolved thread with no agent action says how it was closed', async () => {
  const render = await mount([{ ...thread('a1', 1, 'one'), status: 'resolved', closed_by: 'reviewer' }])
  markers(render())[0].props.onClick()
  const tree = render()

  const [wrapper] = find(tree, (node) => node.props?.style?.position === 'absolute')
  const card = wrapper.props.children
  const [line] = find(card.type(card.props), (node) => node.props.className?.startsWith('rl-action'))
  assert.ok(line, 'the card accounts for the closed thread')
  assert.match(String(line.props.children), /closed in the pane/)
})

test('draft cards make Add to list the primary action', async () => {
  const render = await mount([{ ...thread('a1', 1, ''), draft: true }])
  markers(render())[0].props.onClick()
  const [wrapper] = find(render(), (node) => node.props?.style?.position === 'absolute')
  const card = wrapper.props.children
  const buttons = find(card.type(card.props), (node) => node.type === sdk.Button)
  const add = buttons.find((node) => node.props.children === 'Add to list')
  const send = buttons.find((node) => node.props.children === 'Send now')
  assert.equal(add.props.variant, undefined, 'Add to list uses the primary button style')
  assert.equal(send.props.variant, 'outline', 'Send now is secondary')
})

test('desktop/plugin.js only imports what the runtime loader maps', () => {
  const source = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
  assert.deepEqual(unsupportedSpecifiers(source), [], 'runtime plugins may only import the SDK and react')
})
