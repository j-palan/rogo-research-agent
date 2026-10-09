/**
 * The agent's tools. These stand in for the real research APIs — same shapes,
 * local data, plus a little latency so the app behaves like the real thing.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { companies, documents, financials } from "./data.ts";

/** Thrown when a tool cannot service a request. */
export class ToolError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const toolSchemas: Anthropic.Tool[] = [
  {
    name: "searchCompanies",
    description:
      "Search the coverage universe for companies matching a name or ticker. Returns the company name, ticker and sector for each match.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A company name, ticker or part of either one.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "getCompanyProfile",
    description:
      "Get a company's profile: description, sector, headquarters, headcount, business segments and the filings we hold.",
    input_schema: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description: "A company name, ticker or unique partial name.",
        },
      },
      required: ["company"],
    },
  },
  {
    name: "getFinancials",
    description:
      "Get annual and quarterly financials for a company: revenue, gross margin, operating income, net income and free cash flow.",
    input_schema: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description: "A company name, ticker or unique partial name.",
        },
      },
      required: ["company"],
    },
  },
  {
    name: "searchDocuments",
    description:
      "Keyword search over earnings call transcripts, filing excerpts and press releases.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to search for." },
        company: {
          type: "string",
          description:
            "Optional. Restrict the search using a company name, ticker or unique partial name.",
        },
      },
      required: ["query"],
    },
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchesCompany(company: (typeof companies)[number], needle: string): boolean {
  return (
    normalize(company.name).includes(needle) || normalize(company.ticker).includes(needle)
  );
}

function resolveCompany(query: string) {
  const needle = normalize(query);
  const exact = companies.find(
    (company) =>
      normalize(company.name) === needle || normalize(company.ticker) === needle,
  );
  if (exact) return exact;

  const matches = companies.filter((company) => matchesCompany(company, needle));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new ToolError(`no company found for "${query}"`);
  }

  const choices = matches
    .map((company) => `${company.name} (${company.ticker})`)
    .join(", ");
  throw new ToolError(`ambiguous company "${query}"; matches: ${choices}`);
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolError(`"${key}" must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  return input[key] === undefined ? undefined : requiredString(input, key);
}

async function searchCompanies(query: string) {
  await sleep(250);
  const needle = normalize(query);
  const matches = companies.filter((company) => matchesCompany(company, needle));
  return matches.map((c) => ({
    name: c.name,
    ticker: c.ticker,
    sector: c.sector,
  }));
}

async function getCompanyProfile(company: string) {
  const match = resolveCompany(company);
  await sleep(450);
  return match;
}

async function getFinancials(company: string) {
  const match = resolveCompany(company);
  await sleep(800);
  const record = financials.find((financial) => financial.company === match.name);
  if (!record) {
    throw new ToolError(`no financials found for "${match.name}"`);
  }
  return record;
}

async function searchDocuments(query: string, company?: string) {
  const resolvedCompany = company ? resolveCompany(company) : undefined;
  await sleep(700);

  const terms = String(query).trim().split(/\s+/).filter(Boolean);
  // The upstream document index rejects long queries.
  if (terms.length > 6) {
    throw new ToolError(
      `document search accepts at most 6 terms (received ${terms.length})`,
    );
  }

  const pool = resolvedCompany
    ? documents.filter((document) => document.company === resolvedCompany.name)
    : documents;

  const scored = pool.map((doc) => {
    const haystack = `${doc.title} ${doc.body}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term.toLowerCase())) score += 1;
    }
    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.doc);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "searchCompanies":
      return searchCompanies(requiredString(input, "query"));
    case "getCompanyProfile":
      return getCompanyProfile(requiredString(input, "company"));
    case "getFinancials":
      return getFinancials(requiredString(input, "company"));
    case "searchDocuments":
      return searchDocuments(
        requiredString(input, "query"),
        optionalString(input, "company"),
      );
    default:
      throw new ToolError(`unknown tool "${name}"`);
  }
}
