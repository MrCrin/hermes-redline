// Stand-ins for the Desktop plugin SDK surface desktop/plugin.js imports. Components are element
// types only (nothing renders them); host and useQuery are wired so the pane's render path runs.
const query_results = new Map()

export function __setQueryResult(key, value) {
  query_results.set(key, value)
}

export function __reset() {
  query_results.clear()
  host.workspaces.length = 0
}

export const STATUSBAR_AREAS = { right: 'statusbar.right' }
export const TRANSCRIPT_DIRECTIVE_AREA = 'transcript.directive'

export const Badge = function Badge() {}
export const Button = function Button() {}
export const Codicon = function Codicon() {}
export const Input = function Input() {}
export const MessageTextContent = function MessageTextContent() {}
export const Textarea = function Textarea() {}

export const atom = (initial) => ({ initial, get: () => initial, set() {} })
export const queryClient = { setQueryData() {} }
export const useValue = () => 0

export const useQuery = ({ queryKey }) => ({
  data: query_results.get(queryKey[0]),
  isPending: false,
  isError: false,
})

export const host = {
  workspaces: [],
  notify() {},
  notifyError() {},
  composer: { submit: () => true },
  state: { focusedSessionId: { get: () => 'test-session' } },
  openWorkspace(_id, options) {
    host.workspaces.push(options)
  },
}
