// Load desktop/plugin.js the way the Desktop runtime loader does.
//
// The loader evaluates a plugin from a synthetic `module:` URL and rewrites only the specifiers it
// maps (@hermes/plugin-sdk, react*) to live shims. Everything else is refused up front, because a
// relative path cannot resolve against the blob the module is evaluated from. Evaluating from a
// data: URL reproduces those constraints: a plugin that would be rejected in the app fails here.
import { readFileSync } from 'node:fs'

const STUBS = {
  '@hermes/plugin-sdk': new URL('./stubs/plugin-sdk.mjs', import.meta.url),
  react: new URL('./stubs/react.mjs', import.meta.url),
  'react/jsx-runtime': new URL('./stubs/jsx-runtime.mjs', import.meta.url),
}

const SPECIFIER = /\bfrom\s*(['"])([^'"]+)\1/g

export function unsupportedSpecifiers(source) {
  return [...source.matchAll(SPECIFIER)].map((match) => match[2]).filter((spec) => !STUBS[spec])
}

export function rewriteSource(source) {
  return source.replace(SPECIFIER, (whole, quote, spec) => {
    const stub = STUBS[spec]
    return stub ? `from ${quote}${stub.href}${quote}` : whole
  })
}

export async function loadPlugin(source_path = new URL('../desktop/plugin.js', import.meta.url)) {
  const source = readFileSync(source_path, 'utf8')
  const unsupported = unsupportedSpecifiers(source)
  if (unsupported.length > 0) {
    throw new Error(`unsupported imports: ${unsupported.join(', ')}`)
  }
  const encoded = Buffer.from(rewriteSource(source), 'utf8').toString('base64')
  return import(`data:text/javascript;base64,${encoded}`)
}

/** Walk a jsx tree (react/jsx-runtime elements, no reconciler) and collect matching nodes. */
export function find(node, match, out = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => find(child, match, out))
    return out
  }
  if (!node || typeof node !== 'object' || !node.props) return out
  if (match(node)) out.push(node)
  find(node.props.children, match, out)
  return out
}
