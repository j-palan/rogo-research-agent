import { describe, expect, it } from "vitest";
import { executeTool, ToolError } from "./tools.ts";

describe("company resolution", () => {
  it("accepts tickers and unique partial names across company tools", async () => {
    const [search, financials, profile, documents] = await Promise.all([
      executeTool("searchCompanies", { query: "glbx" }),
      executeTool("getFinancials", { company: "GLBX" }),
      executeTool("getCompanyProfile", { company: "Globex" }),
      executeTool("searchDocuments", { query: "subscription", company: "ITCH" }),
    ]);

    expect(search).toEqual([
      { name: "Globex Inc", ticker: "GLBX", sector: "Diversified Industrials" },
    ]);
    expect(financials).toEqual(expect.objectContaining({ company: "Globex Inc" }));
    expect(profile).toEqual(expect.objectContaining({ name: "Globex Inc" }));
    expect(documents).toEqual(
      expect.arrayContaining([expect.objectContaining({ company: "Initech" })]),
    );
  });

  it("returns actionable errors for ambiguous and invalid company input", async () => {
    await expect(executeTool("getFinancials", { company: "Ac" })).rejects.toThrow(
      'ambiguous company "Ac"; matches: Acme Corp (ACME), Acme Robotics (ACMR)',
    );
    await expect(executeTool("getCompanyProfile", { company: "" })).rejects.toThrow(
      new ToolError('"company" must be a non-empty string'),
    );
  });
});
