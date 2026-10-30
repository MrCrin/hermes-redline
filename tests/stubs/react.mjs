// Minimal react stubs. Two pieces matter for this suite:
//
// - useState, because the pane stores the "which annotation is open" id in state, and the marker
//   click is what sets it;
// - useRef, because the open card is positioned by measuring the block against the scroll
//   container. One shared stand-in answers both refs: querySelector() returns a block rect and the
//   node itself reports as the pane rect.
const slots = []
let cursor = 0

/** Reset the hook cursor. Call before each hand-rolled render (react would do this itself). */
export function __beginRender() {
  cursor = 0
}

/** Forget every hook slot, so one test's state cannot leak into the next mount. */
export function __reset() {
  slots.length = 0
  cursor = 0
}

export function useState(initial) {
  const index = cursor++
  if (!(index in slots)) slots[index] = initial
  return [
    slots[index],
    (next) => {
      slots[index] = typeof next === 'function' ? next(slots[index]) : next
    },
  ]
}

export function useEffect() {}

export const BLOCK_TOP = 100
export const PANE_HEIGHT = 600

const measured = {
  querySelector: () => ({ getBoundingClientRect: () => ({ top: BLOCK_TOP }) }),
  getBoundingClientRect: () => ({ top: 0, height: PANE_HEIGHT }),
}

export function useRef() {
  return { current: measured }
}
