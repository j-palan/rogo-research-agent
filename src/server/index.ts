import "dotenv/config";
import express, { type Response } from "express";
import type { ChatMessage, ChatStreamEvent } from "../shared/chat.ts";
import { runAgent } from "./agent.ts";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "\nANTHROPIC_API_KEY is not set.\nCopy .env.example to .env and add your key, then run `npm run dev` again.\n",
  );
  process.exit(1);
}

const app = express();
app.use(express.json());

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;

  const message = value as Partial<ChatMessage>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.text === "string" &&
    message.text.trim().length > 0
  );
}

function writeEvent(res: Response, event: ChatStreamEvent) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`${JSON.stringify(event)}\n`);
  }
}

app.post("/api/chat", async (req, res) => {
  const submittedMessages: unknown = req.body.messages;
  if (
    !Array.isArray(submittedMessages) ||
    submittedMessages.length === 0 ||
    !submittedMessages.every(isChatMessage) ||
    submittedMessages.at(-1)?.role !== "user"
  ) {
    res.status(400).json({ error: "messages must be a non-empty conversation ending with a user message" });
    return;
  }

  const messages: ChatMessage[] = submittedMessages;
  console.log(`\n[chat] ${messages[messages.length - 1].text}`);

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const result = await runAgent(messages, (event) => {
      writeEvent(res, event);

      switch (event.type) {
        case "iteration":
          console.log(`[agent] iteration ${event.n}`);
          break;
        case "tool_start":
          console.log(
            `[tool:${event.id}]  → ${event.name} ${JSON.stringify(event.input)}`,
          );
          break;
        case "tool_end":
          console.log(`[tool:${event.id}]  ← ${event.name} (${event.ms}ms)`);
          break;
        case "tool_failed":
          console.log(
            `[tool:${event.id}]  ! ${event.name} (${event.ms}ms): ${event.message}`,
          );
          break;
      }
    });

    writeEvent(res, { type: "answer", answer: result.answer });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    writeEvent(res, { type: "error", message });
  } finally {
    res.end();
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`Agent server listening on http://localhost:${port}`);
});
