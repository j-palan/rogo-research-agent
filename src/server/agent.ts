/**
 * The research agent: a tool-use loop over the mocked research tools.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AgentProgressEvent, ChatMessage } from "../shared/chat.ts";
import { companies } from "./data.ts";
import { executeTool, toolSchemas } from "./tools.ts";

const MODEL = process.env.ROGO_MODEL ?? "claude-sonnet-5";
const MAX_ITERATIONS = 12;

const client = new Anthropic();

const SYSTEM_PROMPT = `You are Rogo Research, an assistant that answers questions about companies for financial analysts.

## Research workflow

- Use the conversation to resolve follow-up references such as "it" or "that company."
- Resolve exact company names and tickers from the coverage universe. If a name is genuinely ambiguous, ask one concise clarifying question.
- Use financials for quantitative comparisons and source documents for management commentary, risks, guidance and business changes.
- When several lookups are independent, request them together in one response so they can run concurrently.
- For a full-universe comparison, inspect every covered company before choosing a winner.
- Keep document-search queries focused and at most six terms. Do not repeat a lookup when its result is already in the conversation.
- If a tool fails, retry only when a corrected input is likely to work; otherwise explain the missing evidence.

## Evidence standards

- Base claims on tool results. Do not invent figures, periods, sources or company details.
- Compare like-for-like periods and show the figures behind a ranking or recommendation.
- Preserve warnings and distinguish filed results from preliminary, guided or unaudited figures.
- Cite document-derived claims inline with the returned document ID and date, for example: [DOC-ITCH-001, 2026-01-30].

## Response style

- Lead with the direct answer, then give the evidence and important caveats.
- Be concise and analytical. Use Markdown headings, bullets or a small comparison table when they improve readability.
- State when the available evidence is insufficient for a confident conclusion.

Our coverage universe:
${companies
  .map(
    (c) =>
      `- ${c.name} (${c.ticker}) — ${c.sector}, HQ ${c.hq}, ${c.employees} employees. ${c.description}`,
  )
  .join("\n")}
`;

export type AgentEvent = AgentProgressEvent;

interface AgentResult {
  answer: string;
  iterations: number;
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export async function runAgent(
  conversation: ChatMessage[],
  onEvent: (event: AgentEvent) => void,
): Promise<AgentResult> {
  const messages: Anthropic.MessageParam[] = conversation.map(({ role, text }) => ({
    role,
    content: text,
  }));

  let answer = "";
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    onEvent({ type: "iteration", n: iterations });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      tools: toolSchemas,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUses.length === 0) {
      answer = textOf(response);
      break;
    }

    const toolResults = await Promise.all(
      toolUses.map(async (use): Promise<Anthropic.ToolResultBlockParam> => {
        const startedAt = Date.now();
        onEvent({ type: "tool_start", id: use.id, name: use.name, input: use.input });

        let content: string;
        let isError = false;
        try {
          const output = await executeTool(use.name, use.input as Record<string, unknown>);
          content = JSON.stringify(output);
          onEvent({
            type: "tool_end",
            id: use.id,
            name: use.name,
            ms: Date.now() - startedAt,
          });
        } catch (err) {
          isError = true;
          const message = err instanceof Error ? err.message : String(err);
          content = `${use.name} returned: ${message}`;
          onEvent({
            type: "tool_failed",
            id: use.id,
            name: use.name,
            message,
            ms: Date.now() - startedAt,
          });
        }

        return {
          type: "tool_result",
          tool_use_id: use.id,
          content,
          ...(isError ? { is_error: true } : {}),
        };
      }),
    );

    messages.push({ role: "user", content: toolResults });
  }

  if (!answer) {
    answer =
      "I looked at a number of sources but ran out of research steps before I could pull the answer together. Try asking a narrower question.";
  }

  return { answer, iterations };
}
