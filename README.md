# Rogo Research Agent — engineering exercise

This is a small, working research agent. An analyst asks a question about a company;
the agent calls a few research tools and answers.

It was prototyped quickly. It works, and it is not finished.

## Current implementation

The prototype now behaves like a small research workspace rather than a single-request
demo:

- The agent preserves context within each conversation, so follow-up questions can refer
  to companies mentioned earlier.
- Independent tool calls run concurrently while their results are returned to the model
  in its requested order.
- Company tools accept exact names, tickers and unique partial names, and return clear
  errors for missing or ambiguous matches.
- Research progress is streamed to the interface, including agent iterations, tool names,
  durations and recoverable failures.
- Answers render GitHub-flavored Markdown, including tables, lists, links and code blocks.
- Chats persist in the browser and can be created, selected, renamed and deleted.
- The responsive interface includes a collapsible history sidebar, a focused new-chat
  screen and accessible confirmation dialogs.

See [NOTES.md](./NOTES.md) for the reasoning behind these choices, tradeoffs and the next
improvements I would make.

## Your task

**Review the implementation and improve the areas you believe would have the highest impact.**

Possible areas include:

- **Product / UX** — interaction quality, communicating progress, handling ambiguous
  requests, presenting answers clearly, error states
- **Agent behavior** — tool selection, repeated or unnecessary tool calls, loop and
  stopping behavior, handling tool failures, maintaining useful context, answer quality
- **Performance / efficiency** — latency, unnecessary model or tool calls, parallelizing
  independent work, context and token usage
- **Engineering quality** — architecture, reliability, maintainability, testing,
  observability, error handling

You do **not** need to address every area. We care much more about the quality of your
decisions than the amount of code you write. A focused, well-reasoned change to two
areas beats a shallow pass over all four.

**Please spend no more than 60–90 minutes.** Stop when the time is up, even mid-thought.
We would rather see what you chose to do first.

**You may use any AI coding tools you normally use** — Claude Code, Cursor, Codex,
whatever your setup is. We use them too. You will be asked to explain the code you
submit, including code a tool generated for you.

We will discuss your approach and implementation in the interview.

## Setup

Requires Node 22 (or Node 20.19+).

```bash
npm install
cp .env.example .env   # then paste in the API key we sent you
npm run dev
```

Open http://localhost:5173. The agent server logs its tool calls to the terminal,
which is usually the fastest way to see what the agent is actually doing.

Chat history is stored in the browser's `localStorage`. Clearing site data removes saved
conversations; no chat content is persisted by the Express server.

## Try it

Some questions to start with:

- "Compare Acme and Globex and tell me which one appears to be growing faster."
- "What are the biggest risks Umbrella Health flags in its filings?"
- "How is Initech's subscription transition going?"
- "Which company in the universe is growing fastest?"
- "Is GLBX a better business than ITCH?"

## The code

### Request flow

1. The client sends the active conversation to `POST /api/chat`.
2. The server validates that the request contains a non-empty conversation ending in a
   user message.
3. The agent asks Claude to answer or request research tools.
4. Tools requested in the same turn execute concurrently. Each result is returned with
   the corresponding tool-use ID, including structured error status when a call fails.
5. The loop continues until Claude returns a text answer or reaches the iteration limit.
6. The server streams progress and the final answer as newline-delimited JSON; the
   client updates the active assistant message as events arrive.

The final answer comes directly from the agent loop. There is no unconditional second
model call to rewrite the answer.

### Available tools

| Tool | Purpose | Mock latency |
| --- | --- | --- |
| `searchCompanies` | Find companies by name, ticker or partial match | 250 ms |
| `getCompanyProfile` | Return company metadata, segments and available filings | 450 ms |
| `getFinancials` | Return annual and quarterly financial results | 800 ms |
| `searchDocuments` | Search filing excerpts, transcripts and press releases | 700 ms |

The delays intentionally simulate external research APIs and make concurrency and progress
reporting observable during development.

### Streaming protocol

`POST /api/chat` returns `application/x-ndjson`. Events include:

- `iteration` when the agent begins another reasoning/tool-use cycle.
- `tool_start`, `tool_end` and `tool_failed` for visible research activity.
- `answer` for the final Markdown response.
- `error` when the request cannot complete.

The progress stream communicates actions and outcomes without exposing private
chain-of-thought.

Key paths:

| File | What it is |
| --- | --- |
| `src/server/index.ts` | Express server, one `POST /api/chat` endpoint |
| `src/server/agent.ts` | The agent loop — system prompt, tool-use loop, final answer |
| `src/server/tools.ts` | Tool schemas and tool execution |
| `src/server/data.ts` | All the research data. Fictional, local, deterministic |
| `src/client/App.tsx` | Conversation UI, streaming state and request handling |
| `src/client/ChatSidebar.tsx`, `src/client/chat-store.ts` | Chat navigation and local persistence |
| `src/client/icons.tsx`, `src/client/styles.css` | Shared UI icons and styling |
| `src/client/main.tsx` | React mount point |
| `src/shared/chat.ts` | Chat types shared by the client and server |
| `src/evals/research.ts` | Live behavioral evals and latency/tool benchmarks |
| `vite.config.ts`, `package.json` | Vite dev server proxies `/api` to port 8787 |

There are five fictional companies. The tools are backed entirely by `src/server/data.ts` —
no network calls, no credentials beyond the model key, nothing to set up. Each tool
sleeps for a few hundred milliseconds to stand in for a real API.

### Client state

Each chat stores a title, last-used timestamp and transcript. The first user message
creates the default one-line title, which can later be renamed. Pending assistant
placeholders are cleaned up when persisted state is restored, so an interrupted request
does not leave the interface permanently loading.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the agent server and the web UI together |
| `npm run dev:server` | Agent server only, on port 8787 |
| `npm run dev:web` | Web UI only, on port 5173 |
| `npm run eval` | Run the live agent eval suite (uses the configured model) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Runs Vitest |

The model defaults to `claude-sonnet-5`. Set `ROGO_MODEL` in `.env` to change it.

The eval suite checks factual concepts with deterministic rubrics and reports latency,
iterations, tool calls and tool failures. It makes real model calls and requires
`ANTHROPIC_API_KEY`. Run one case by passing its ID, for example:

```bash
npm run eval -- context-follow-up
```

The regular unit tests do not call the model or require an API key. The live evals do,
and their exact wording can vary because they exercise the configured model.

## Submitting

Commit your work on a branch and send us the repo (or a zip, or a PR — whatever is
easiest). If you want to leave notes on what you changed and why, add a short
`NOTES.md`. Bullet points are fine; please don't write a design document.

If you noticed something you deliberately chose *not* to fix, that is worth a line
too — we will ask about it either way.
