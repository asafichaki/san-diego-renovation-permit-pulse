import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const summary = JSON.parse(await readFile(new URL("../data/summary.json", import.meta.url), "utf8"));

test("summary has defensible non-empty aggregates", () => {
  assert.equal(summary.title, "San Diego Renovation Permit & Cost Pulse");
  assert.ok(summary.relevant_unique_projects > 100);
  assert.ok(summary.categories.length >= 4);
  assert.ok(summary.monthly.length >= summary.categories.length);
  assert.match(summary.last_issue_date_in_analysis, /^2026-\d{2}-\d{2}$/);
});

test("published output excludes project-level and personal fields", async () => {
  const files = ["summary.json", "category-summary.csv", "monthly-category-counts.csv", "san-diego-cost-ranges.csv"];
  for (const file of files) {
    const contents = await readFile(new URL(`../data/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(contents, /GIS_ADDRESS|GIS_LATITUDE|GIS_LONGITUDE|APPROVAL_PERMIT_HOLDER|PROJECT_SCOPE|APPROVAL_SCOPE/i);
  }
});

test("cost ranges are explicitly separate planning ranges", () => {
  assert.ok(summary.costs.length >= 5);
  for (const row of summary.costs) {
    assert.equal(row.price_basis, "total_project_planning_range");
    assert.ok(row.low_usd > 0);
    assert.ok(row.high_usd > row.low_usd);
  }
  assert.match(summary.methodology.cost_separation, /not permit valuations/i);
});

test("elapsed-day language does not claim official processing time", () => {
  assert.match(summary.methodology.elapsed_metric, /not City staff processing time/i);
  assert.ok(summary.median_elapsed_calendar_days >= 0);
});
