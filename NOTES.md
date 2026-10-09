# Implementation notes

## What I prioritized

I focused on changes that improve the analyst experience while also reducing agent
latency and making failures easier to understand:

- Faster research through concurrent execution of independent tool calls.
- Lower model cost and less factual drift by removing the unconditional answer-rewrite pass.
- Better research quality through a more explicit system prompt, conversation context,
  source expectations and tool-recovery behavior.
- More transparent UX through streamed research activity, tool timing and failure states.
- A usable conversation workspace with Markdown answers, persisted chat history and
  responsive chat management.

## Key decisions

- **Parallel tools, ordered results.** Tool calls from the same model response run through
  `Promise.all`. This keeps batch latency close to the slowest call while preserving the
  model's original tool-result order.
- **One final-answer pass.** The answer returned by the tool-use loop is shown directly.
  Avoiding a second full-transcript rewrite reduces latency, tokens and opportunities to
  alter caveats or figures.
- **Conversation-scoped context.** Each request includes the active chat's prior user and
  assistant messages. Separate chats remain isolated from one another.
- **Explicit tool failures.** Failed tools emit progress events and return Anthropic
  `tool_result` blocks with `is_error: true`, allowing the model to retry with corrected
  input or explain missing evidence.
- **Flexible company resolution.** Company tools accept names, tickers and unique partial
  names. Ambiguous input produces an actionable error rather than silently choosing.
- **Progressive streaming.** The server streams newline-delimited JSON events for agent
  iterations, tool starts, completions, failures and the final answer. The UI uses these
  events to explain what the agent is doing without exposing hidden chain-of-thought.
- **Local-first chat management.** Chats, generated titles and transcripts are stored in
  `localStorage`. Users can create, switch, rename and delete chats; deletion requires
  confirmation.
- **Focused empty state.** A centered composer is the primary action for a new chat.
  Example prompts are available through a compact disclosure instead of dominating the
  screen.

## Testing and evaluation

- Unit tests cover parallel tool execution, ordered results, tool failure propagation,
  ticker and partial-name resolution, ambiguity handling, chat persistence, renaming and
  deletion.
- TypeScript runs with strict unused-local and unused-parameter checks.
- The live eval suite checks factual concepts and reports latency, iteration count, tool
  usage and failures for comparison, ranking, risk synthesis and contextual follow-ups.
- The production client build is used as a final integration check.

## Tradeoffs and next steps

- Chat history is browser-local. A production version would persist server-side per user
  and synchronize across devices.
- The full active transcript is sent on every request. Long conversations would need a
  context budget, summarization or retrieval strategy.
- Progress events stream immediately, but the final prose answer is delivered as one
  event. Token-level answer streaming would improve perceived latency for long responses.
- Requests cannot currently be cancelled from the UI. An `AbortController` plus server
  disconnect handling would prevent unnecessary work after navigation or cancellation.
- Document search is a deterministic keyword matcher over mocked data. Production search
  would need ranking, metadata filters and stronger citation guarantees.
- Behavioral evals use deterministic regex rubrics around live model output. They are
  intentionally lightweight; a larger suite should add regression fixtures and judged
  answer-quality checks.
- The current automated suite does not include browser-level interaction or visual
  regression coverage. Those would be the next tests to add for the sidebar, dialogs,
  responsive layout and streamed activity states.
