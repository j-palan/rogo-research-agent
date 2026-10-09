export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export type AgentProgressEvent =
  | { type: "iteration"; n: number }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; name: string; ms: number }
  | { type: "tool_failed"; id: string; name: string; message: string; ms: number };

export type ChatStreamEvent =
  | AgentProgressEvent
  | { type: "answer"; answer: string }
  | { type: "error"; message: string };
