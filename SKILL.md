---
name: reading
description: Use when a redline batch arrives from the desktop panel, or after delivering a Markdown document or source file the user will read or review.
version: 1.0.0
metadata:
  hermes:
    tags: [desktop, review, markdown, code]
---

# redline (guided Markdown and code review)

This bundled skill is available as `redline:reading`.

## Emit the card

After writing a file the user will likely review — Markdown (report, plan, doc, manuscript, draft PR/README) or supported source/config code — end the response with a lone line:

```
::redline{file="/absolute/path/to/file"}
```

The installed plugin renders a card in the transcript; one click opens the file in the Redline review pane docked beside the chat. Do not emit for trivial files (sidecars, scratch, internal notes, READMEs of repos).

When the plugin's hooks are active they append the directive automatically for files written with `write_file`/`patch` in the turn; check the response already contains `::redline{` before adding one manually — never emit twice.

## Handle a batch

A user message starting with `⁂ redline — review of <path> (N notes):` is a review batch from the pane:

```
1. [comment|question|change request] selection: "quote"   # code files: "L42: quote"
   → the user's note
```

1. Read the file first — quotes may be truncated; locate the block by prefix. For code files the `L<n>:` prefix is the 1-based line number of the selection.
2. `question` → answer in chat. `change request` → edit the reviewed file IN PLACE (within the requested scope; never create a copy or a new file unless the user explicitly asks). This IN-PLACE rule overrides any general "never modify working code — create a new file instead" convention for files opened through the redline panel. `comment` → discuss/adjust.
3. After applying a change, mark the item `"status": "resolved"` in the sidecar `<file><ext>.redline.json` beside the reviewed file — edit it with `patch` (targeted find/replace on the status field), not a terminal script. Add an `"action"` string on the same item: one line saying what you actually did, which the pane prints on the card. Resolving also drops the highlight wash and turns the margin marker into a tick, so the reviewer sees at a glance what is closed and what the agent did about it. A thread closed with no action recorded shows only that it was closed, so always leave a line. Do not touch `quote`, `start` or `end`: those are the anchor the pane paints.
4. Answer as a numbered list mirroring the batch (1→1, 2→2).
5. Never delete sidecar items unless the user asks.
