import { beforeEach, expect, it, vi } from "vitest";
import type { ChatMessage } from "../shared/chat.ts";
import { runAgent, type AgentEvent } from "./agent.ts";

const mocks = vi.hoisted(() => ({
  createMessage: vi.fn(async (_request: unknown): Promise<unknown> => ({})),
  executeTool: vi.fn(async (_name: string, _input: Record<string, unknown>): Promise<unknown> => ({})),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mocks.createMessage };
  },
}));

vi.mock("./tools.ts", () => ({
  executeTool: mocks.executeTool,
  toolSchemas: [],
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.createMessage.mockReset();
  mocks.executeTool.mockReset();
});

it("runs a tool batch concurrently and returns results in request order despite a failure", async () => {
  const first = deferred<unknown>();
  const second = deferred<unknown>();
  const third = deferred<unknown>();
  const pending = new Map([
    ["Acme Corp", first],
    ["Globex Inc", second],
    ["Umbrella Health", third],
  ]);

  mocks.executeTool.mockImplementation((_name, input) => {
    const call = pending.get(input.company as string);
    if (!call) throw new Error("unexpected company");
    return call.promise;
  });

  mocks.createMessage
    .mockResolvedValueOnce({
      content: [
        { type: "tool_use", id: "first", name: "getFinancials", input: { company: "Acme Corp" } },
        { type: "tool_use", id: "second", name: "getFinancials", input: { company: "Globex Inc" } },
        { type: "tool_use", id: "third", name: "getFinancials", input: { company: "Umbrella Health" } },
      ],
    })
    .mockResolvedValueOnce({ content: [{ type: "text", text: "Draft answer" }] });

  const conversation: ChatMessage[] = [
    { role: "user", text: "Tell me about Acme Corp" },
    { role: "assistant", text: "Acme Corp is an industrial automation company." },
    { role: "user", text: "Compare it with Globex Inc" },
  ];
  const events: AgentEvent[] = [];
  const run = runAgent(conversation, (event) => events.push(event));

  // All three calls must start before any one of them completes.
  await vi.waitFor(() => expect(mocks.executeTool).toHaveBeenCalledTimes(3));
  expect(events.filter((event) => event.type === "tool_start")).toHaveLength(3);

  third.resolve({ company: "Umbrella Health" });
  second.reject(new Error("financials unavailable"));
  first.resolve({ company: "Acme Corp" });

  await expect(run).resolves.toEqual({ answer: "Draft answer", iterations: 2 });
  expect(mocks.createMessage).toHaveBeenCalledTimes(2);

  const initialRequest = mocks.createMessage.mock.calls[0][0] as {
    messages: { role: string; content: unknown }[];
  };
  expect(initialRequest.messages.slice(0, conversation.length)).toEqual([
    { role: "user", content: "Tell me about Acme Corp" },
    { role: "assistant", content: "Acme Corp is an industrial automation company." },
    { role: "user", content: "Compare it with Globex Inc" },
  ]);

  const request = mocks.createMessage.mock.calls[1][0] as {
    messages: { role: string; content: unknown }[];
  };
  expect(request.messages.filter((message) => message.role === "user").at(-1)).toEqual({
    role: "user",
    content: [
      { type: "tool_result", tool_use_id: "first", content: '{"company":"Acme Corp"}' },
      {
        type: "tool_result",
        tool_use_id: "second",
        content: "getFinancials returned: financials unavailable",
        is_error: true,
      },
      { type: "tool_result", tool_use_id: "third", content: '{"company":"Umbrella Health"}' },
    ],
  });
  expect(events.filter((event) => event.type === "tool_failed")).toEqual([
    expect.objectContaining({
      type: "tool_failed",
      id: "second",
      name: "getFinancials",
      message: "financials unavailable",
    }),
  ]);
  expect(events.filter((event) => event.type === "tool_end")).toEqual([
    expect.objectContaining({ type: "tool_end", id: "third" }),
    expect.objectContaining({ type: "tool_end", id: "first" }),
  ]);
});
