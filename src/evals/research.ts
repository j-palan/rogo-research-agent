import "dotenv/config";
import type { ChatMessage } from "../shared/chat.ts";
import { runAgent, type AgentEvent } from "../server/agent.ts";

interface Criterion {
  label: string;
  patterns: RegExp[];
}

interface EvalCase {
  id: string;
  description: string;
  conversation: ChatMessage[];
  criteria: Criterion[];
  minimumScore: number;
}

const cases: EvalCase[] = [
  {
    id: "growth-comparison",
    description: "Compares two companies using like-for-like annual growth",
    conversation: [
      {
        role: "user",
        text: "Compare Acme Corp and Globex Inc and tell me which one grew faster in FY2025.",
      },
    ],
    criteria: [
      {
        label: "selects Acme Corp",
        patterns: [/Acme Corp.{0,100}faster/is, /faster.{0,100}Acme Corp/is],
      },
      { label: "states Acme growth", patterns: [/5\.5\s*%/, /5\.5 percent/i] },
      { label: "states Globex growth", patterns: [/2\.1\s*%/, /2\.1 percent/i] },
      { label: "uses FY2025 comparison", patterns: [/FY\s*2025/i, /2025/] },
    ],
    minimumScore: 0.75,
  },
  {
    id: "universe-ranking",
    description: "Finds the fastest-growing company across the full universe",
    conversation: [
      { role: "user", text: "Which company in the coverage universe grew fastest in FY2025?" },
    ],
    criteria: [
      { label: "selects Acme Robotics", patterns: [/Acme Robotics/i, /ACMR/] },
      { label: "states roughly 47% growth", patterns: [/47(?:\.\d+)?\s*%/, /47 percent/i] },
      { label: "uses FY2025 comparison", patterns: [/FY\s*2025/i, /2025/] },
      {
        label: "flags Initech data caveat",
        patterns: [
          /Initech.{0,140}(?:preliminary|unaudited|not been filed|not filed)/is,
        ],
      },
    ],
    minimumScore: 0.75,
  },
  {
    id: "risk-synthesis",
    description: "Synthesizes filing risks and cites the supporting document",
    conversation: [
      { role: "user", text: "What are the biggest risks Umbrella Health flags in its filings?" },
    ],
    criteria: [
      { label: "identifies acquisition dependence", patterns: [/acquisition/i] },
      { label: "identifies integration risk", patterns: [/integrat/i] },
      { label: "identifies reimbursement exposure", patterns: [/reimbursement/i] },
      { label: "cites source document", patterns: [/DOC-UMBR-002/] },
    ],
    minimumScore: 0.75,
  },
  {
    id: "context-follow-up",
    description: "Uses prior conversation to resolve a pronoun and preserves caveats",
    conversation: [
      { role: "user", text: "I am reviewing Initech." },
      {
        role: "assistant",
        text: "Understood. Initech is the enterprise software company in the coverage universe.",
      },
      { role: "user", text: "How is its subscription transition going?" },
    ],
    criteria: [
      { label: "states subscription mix reached 68%", patterns: [/68\s*%/, /68 percent/i] },
      { label: "compares with prior 62%", patterns: [/62\s*%/, /62 percent/i] },
      { label: "preserves preliminary caveat", patterns: [/preliminary/i, /unaudited/i] },
      { label: "cites source document", patterns: [/DOC-ITCH-001/] },
    ],
    minimumScore: 0.75,
  },
];

function score(answer: string, criteria: Criterion[]) {
  const results = criteria.map((criterion) => ({
    label: criterion.label,
    passed: criterion.patterns.some((pattern) => pattern.test(answer)),
  }));
  const passed = results.filter((result) => result.passed).length;
  return { results, passed, total: results.length, ratio: passed / results.length };
}

async function runCase(evalCase: EvalCase) {
  let toolCalls = 0;
  let toolFailures = 0;
  const startedAt = performance.now();

  const result = await runAgent(evalCase.conversation, (event: AgentEvent) => {
    if (event.type === "tool_start") toolCalls++;
    if (event.type === "tool_failed") toolFailures++;
  });

  const elapsedMs = Math.round(performance.now() - startedAt);
  const grade = score(result.answer, evalCase.criteria);
  const passed = grade.ratio >= evalCase.minimumScore;

  console.log(`\n${passed ? "PASS" : "FAIL"} ${evalCase.id} — ${evalCase.description}`);
  console.log(
    `${grade.passed}/${grade.total} checks | ${elapsedMs}ms | ${result.iterations} iterations | ${toolCalls} tools | ${toolFailures} failures`,
  );
  for (const check of grade.results) {
    console.log(`  ${check.passed ? "✓" : "✗"} ${check.label}`);
  }
  console.log(`\n${result.answer}`);

  return { passed, grade, elapsedMs };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required to run live evals");
  }

  const requestedIds = process.argv.slice(2);
  const selected = requestedIds.length
    ? cases.filter((evalCase) => requestedIds.includes(evalCase.id))
    : cases;

  if (selected.length === 0) {
    const availableIds = cases.map((evalCase) => evalCase.id).join(", ");
    throw new Error(`No matching eval cases. Available: ${availableIds}`);
  }

  const results = [];
  for (const evalCase of selected) {
    results.push(await runCase(evalCase));
  }

  const passedCases = results.filter((result) => result.passed).length;
  const passedChecks = results.reduce((sum, result) => sum + result.grade.passed, 0);
  const totalChecks = results.reduce((sum, result) => sum + result.grade.total, 0);
  const totalMs = results.reduce((sum, result) => sum + result.elapsedMs, 0);

  console.log(
    `\nSummary: ${passedCases}/${results.length} cases passed | ${passedChecks}/${totalChecks} checks | ${totalMs}ms total`,
  );

  if (passedCases !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
