// Annotations store the text that was highlighted, but the pane never showed which words a thread
// refers to: the margin marker sat on the paragraph. These tests pin the logic that locates a stored
// quote inside the rendered text of its block and places each marker against its own span.
//
// The DOM half (Range construction, measured rectangles, the painted wash) is not covered here; it
// needs a layout engine. Everything decidable from strings is covered.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadPlugin } from './load-plugin.mjs'

const plugin = await loadPlugin()
const { locateQuote, stackPositions, blockMarkerTops, spanFromPoints, spanForAnnotation, washBoxes, markerGlyph, resolutionLine, mergeBoxes } = plugin

const collapse = (text) => text.replace(/\s+/g, ' ')

test('locates the highlighted span inside its paragraph', () => {
  const text = 'The claim covers defrayal, payroll reconciliation and evidence sampling for the period.'
  const span = locateQuote(text, 'defrayal, payroll reconciliation')
  assert.ok(span, 'the quote is found')
  assert.equal(text.slice(span.start, span.end), 'defrayal, payroll reconciliation')
})

test('a selection that wrapped across lines still matches', () => {
  const text =
    'Review meetings should allow sufficient time for a meaningful discussion of project\n' +
    'progress, risks, finances, deliverables and next steps.'
  const span = locateQuote(text, 'meaningful discussion of project progress, risks')
  assert.ok(span, 'line breaks in the rendered text do not defeat the match')
  assert.equal(collapse(text.slice(span.start, span.end)), 'meaningful discussion of project progress, risks')
})

test('falls back to the verbatim head when the tail of the quote differs', () => {
  // The selection crossed a bold run, so the rendered text no longer contains the stored quote
  // verbatim. The head still identifies the passage.
  const text = 'Review meetings should allow a meaningful discussion of project progress and next steps.'
  const quote = 'a meaningful discussion of project progress **and next steps**'
  const span = locateQuote(text, quote)
  assert.ok(span, 'the head of the quote anchors the span')
  assert.equal(span.start, text.indexOf('a meaningful'))
  assert.equal(span.end - span.start, 40, 'the head fallback covers the 40-character prefix')
})

test('a quote whose divergence starts early anchors on the longest matching prefix', () => {
  // Markup inside the first few words, or a selection that ran on into the next paragraph: the head
  // of the quote is not enough on its own, so the longest prefix that is still in the text wins.
  const text = 'The project remains within scope and the milestones are on track.'
  const span = locateQuote(text, 'within scope **and** the milestones')
  assert.ok(span, 'the passage is still anchored')
  assert.equal(text.slice(span.start, span.end), 'within scope')
})

test('a selection inside one text node maps to a span', () => {
  assert.deepEqual(spanFromPoints([20], { index: 0, offset: 5 }, { index: 0, offset: 12 }), { start: 5, end: 12 })
})

test('a selection spanning several nodes keeps both ends', () => {
  assert.deepEqual(spanFromPoints([10, 10, 10], { index: 0, offset: 8 }, { index: 2, offset: 4 }), { start: 8, end: 24 })
})

test('a selection that ran on past the block is clamped to it', () => {
  // Selecting across a paragraph break: the annotation belongs to the block it started in.
  assert.deepEqual(spanFromPoints([10, 10, 10], { index: 0, offset: 8 }, { index: 3, offset: 0 }), { start: 8, end: 30 })
})

test('an empty selection produces nothing', () => {
  assert.equal(spanFromPoints([10], { index: 0, offset: 4 }, { index: 0, offset: 4 }), null)
})

test('stored offsets win when they still hold the quoted text', () => {
  const text = 'The project remains within scope and the milestones are on track.'
  assert.deepEqual(spanForAnnotation(text, { quote: 'within scope', start: 20, end: 32 }), { start: 20, end: 32 })
})

test('stale offsets fall back to matching the quote', () => {
  // The paragraph was edited above the annotation, so its offsets moved. The quote still finds it.
  const text = 'Edited. The project remains within scope and the milestones are on track.'
  const span = spanForAnnotation(text, { quote: 'within scope', start: 20, end: 32 })
  assert.equal(text.slice(span.start, span.end), 'within scope')
  assert.notEqual(span.start, 20)
})

test('an annotation with no offsets still anchors by quote', () => {
  // Sidecars written before offsets were recorded, and any annotation whose span was trimmed.
  const text = 'The project remains within scope and the milestones are on track.'
  const span = spanForAnnotation(text, { quote: 'the milestones' })
  assert.equal(text.slice(span.start, span.end), 'the milestones')
})

test('a resolved thread keeps its quote but paints nothing over the text', () => {
  const mark = { boxes: [{ left: 0, top: 0, width: 10, height: 10 }] }
  assert.deepEqual(washBoxes({ status: 'resolved' }, mark), [])
  assert.equal(washBoxes({ status: 'sent' }, mark).length, 1)
  assert.equal(washBoxes({ status: 'open' }, mark).length, 1)
  assert.deepEqual(washBoxes({ status: 'open' }, null), [])
})

test('a resolved thread is marked with a tick, an open one with its kind', () => {
  assert.equal(markerGlyph({ status: 'resolved', kind: 'question' }), '✓')
  assert.equal(markerGlyph({ status: 'open', kind: 'question' }), '◇')
  assert.equal(markerGlyph({ status: 'sent', kind: 'change' }), '✎')
})

test('a closed thread shows what the agent did about it', () => {
  assert.equal(resolutionLine({ status: 'resolved', action: 'Rewrote the bullet.' }), '✓ Rewrote the bullet.')
})

test('a thread closed with no agent action says who closed it', () => {
  // The pane's own resolve button closes a thread without any agent involvement, so the card has to
  // account for that rather than showing a resolved thread with nothing to say.
  assert.equal(resolutionLine({ status: 'resolved', closed_by: 'reviewer' }), '✓ closed in the pane')
})

test('a thread closed before the record existed admits only what is known', () => {
  assert.equal(resolutionLine({ status: 'resolved' }), '✓ closed, no action recorded')
})

test('an open thread has no resolution line', () => {
  assert.equal(resolutionLine({ status: 'open' }), null)
  assert.equal(resolutionLine({ status: 'sent' }), null)
})

test('rects from one rendered line merge into a single bar', () => {
  // A selection crossing bold, italic and a link comes back as one rect per inline run, with
  // different heights and slight overlaps, which double-tints the text where they stack.
  const boxes = [
    { left: 0, top: 10, width: 60, height: 20 },
    { left: 58, top: 8, width: 40, height: 24 },
    { left: 96, top: 10, width: 30, height: 20 },
  ]
  assert.deepEqual(mergeBoxes(boxes), [{ left: 0, top: 8, width: 126, height: 24 }])
})

test('rects on separate rendered lines stay separate', () => {
  const boxes = [
    { left: 0, top: 10, width: 600, height: 20 },
    { left: 0, top: 40, width: 200, height: 20 },
  ]
  assert.deepEqual(mergeBoxes(boxes), boxes)
})

test('a single rect is left alone, and unsorted input still merges', () => {
  assert.deepEqual(mergeBoxes([{ left: 5, top: 10, width: 10, height: 20 }]), [{ left: 5, top: 10, width: 10, height: 20 }])
  const sorted = mergeBoxes([
    { left: 96, top: 10, width: 30, height: 20 },
    { left: 0, top: 10, width: 60, height: 20 },
  ])
  assert.deepEqual(sorted, [{ left: 0, top: 10, width: 126, height: 20 }])
})

test('offsets keep a repeated phrase on the occurrence that was selected', () => {
  // The plain quote is ambiguous, so matching alone would take the first occurrence; the stored
  // offsets decide which one the reviewer actually highlighted.
  const text = 'the risk register is reviewed at every meeting and the risk register is updated before the review.'
  const phrase = 'the risk register'
  const first = text.indexOf(phrase)
  const second = text.indexOf(phrase, first + 1)
  const span = spanForAnnotation(text, { quote: phrase, start: second, end: second + phrase.length })
  assert.equal(span.start, second)
})

test('returns nothing when the passage has been rewritten', () => {
  // No anchor to paint: the caller falls back to a margin slot rather than inventing a position.
  assert.equal(locateQuote('The project remains within scope.', 'defrayal and payroll reconciliation'), null)
  assert.equal(locateQuote('', 'anything'), null)
})

test('markers that would collide are pushed apart', () => {
  assert.deepEqual(stackPositions([10, 12, 40], 22), [10, 32, 54])
})

test('markers that already clear each other are left where they are', () => {
  assert.deepEqual(stackPositions([10, 60, 90], 22), [10, 60, 90])
})

test('stacking follows the spans, not the order they were created in', () => {
  assert.deepEqual(stackPositions([24, 10], 22), [32, 10])
})

test('a located span keeps its place and an unlocated one takes a free slot', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const marks = { a: { top: 40 }, c: { top: 120 } }
  assert.deepEqual(blockMarkerTops(items, marks, 22), [
    { id: 'a', top: 40 },
    { id: 'b', top: 2 },
    { id: 'c', top: 120 },
  ])
})

test('two threads on the same words stack instead of overlapping', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const marks = { a: { top: 30 }, b: { top: 34 } }
  assert.deepEqual(blockMarkerTops(items, marks, 22), [
    { id: 'a', top: 30 },
    { id: 'b', top: 52 },
    { id: 'c', top: 2 },
  ])
})
