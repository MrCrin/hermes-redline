// jsx/jsxs as plain trees: the tests inspect the element tree, there is no reconciler or DOM.
export const jsx = (type, props, key) => ({ type, props, key })
export const jsxs = (type, props, key) => ({ type, props, key })
