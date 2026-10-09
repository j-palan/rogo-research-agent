# Notes

## What I changed

- Ran independent tool calls in parallel to reduce wait time.
- Removed the extra model rewrite to reduce latency and cost.
- Added conversation history so follow-up questions retain context.
- Improved company lookup for tickers and partial names.
- Made tool activity and failures visible while the agent works.
- Added Markdown responses and lightweight agent evals.
- Added saved chats with rename, delete and a responsive sidebar.
- Redesigned the interface around a cleaner research workflow.

## Why

I focused on the biggest user-facing improvements: faster answers, clearer progress,
better follow-up conversations and easier chat organization.

## What I would do next

- Persist chats on the server instead of only in the browser.
- Add request cancellation and token-by-token answer streaming.
- Add browser-level tests for the main chat interactions.
- LLM as jusdge for evals instead of deterministic checks
