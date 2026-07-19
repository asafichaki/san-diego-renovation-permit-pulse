import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CITY_DATASET_PAGE = "https://data.sandiego.gov/datasets/development-permits/";
const CITY_DATA_URL = "https://seshat.datasd.org/development_permits/approvals_issued_2026_datasd.csv";
const CITY_TERMS_URL = "https://data.sandiego.gov/help/guides/terms/";
const RENOLOGY_DATA_URL = "https://www.therenology.com/cost-index/data.json";
const RENOLOGY_COST_INDEX = "https://www.therenology.com/cost-index";
const RENOLOGY_METHODOLOGY = "https://www.therenology.com/methodology";

const CATEGORY_DEFINITIONS = [
  { name: "ADU", pattern: /\b(?:adu|jadu|accessory dwelling unit|companion unit)\b/i },
  { name: "Kitchen", pattern: /\bkitchens?\b/i },
  { name: "Bathroom", pattern: /\b(?:bathrooms?|baths?|restrooms?)\b/i },
  { name: "Roofing", pattern: /\b(?:re[ -]?roof(?:ing)?|roof replacement|replace(?:ment)? (?:of )?(?:the )?roof|roofing)\b/i },
  { name: "General remodel", pattern: /\b(?:remodel(?:ing|led)?|renovat(?:e|ed|ion|ing)|alteration)\b/i }
];

const RESIDENTIAL_PATTERN = /\b(?:1 or 2 fam|one family|two family|single[ -]?family|residential|residence|dwelling unit|adu|jadu|companion unit|acc apt|guest house|mobile home|condominium|condo)\b/i;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, ""));
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")).join("\n")}\n`;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function elapsedDays(startValue, endValue) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end || end < start) return null;
  return Math.round((end - start) / 86_400_000);
}

function percentile(values, proportion) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(proportion * sorted.length) - 1;
  return sorted[Math.max(0, rank)];
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function fetchRequired(url) {
  const response = await fetch(url, { headers: { "user-agent": "RenologyPermitPulse/1.0 (+https://www.therenology.com/)" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response;
}

function categorize(record) {
  const combinedText = [
    record.PROJECT_TITLE,
    record.PROJECT_SCOPE,
    record.APPROVAL_SCOPE,
    record.JOB_BC_CODE_DESCRIPTION
  ].filter(Boolean).join(" ");

  const residentialEvidence = `${record.JOB_BC_CODE_DESCRIPTION || ""} ${combinedText}`;
  if (!RESIDENTIAL_PATTERN.test(residentialEvidence)) return [];
  return CATEGORY_DEFINITIONS.filter((category) => category.pattern.test(combinedText)).map((category) => category.name);
}

function publicRecord(record, category) {
  return {
    project_id: record.PROJECT_ID,
    category,
    issue_date: record.APPROVAL_ISSUE_DATE,
    issue_month: record.APPROVAL_ISSUE_DATE.slice(0, 7),
    elapsed_calendar_days: elapsedDays(record.PROJECT_CREATE_DATE, record.APPROVAL_ISSUE_DATE),
    processing_code: record.PROJECT_PROCESSING_CODE || record.APPROVAL_PROCESSING_CODE || "Not stated"
  };
}

async function main() {
  const retrievedAt = dateOnly();
  const cityResponse = await fetchRequired(CITY_DATA_URL);
  const cityLastModified = cityResponse.headers.get("last-modified");
  const cityText = new TextDecoder("utf-8", { fatal: false }).decode(await cityResponse.arrayBuffer());
  const cityRows = parseCsv(cityText);

  const costResponse = await fetchRequired(RENOLOGY_DATA_URL);
  const costData = await costResponse.json();

  const relevantApprovalTypes = new Set(["Combination Building Permit", "Building Permit"]);
  const projectCategory = new Map();

  for (const record of cityRows) {
    if (!relevantApprovalTypes.has(record.APPROVAL_TYPE)) continue;
    if (!record.PROJECT_ID || !record.APPROVAL_ISSUE_DATE?.startsWith("2026-")) continue;

    for (const category of categorize(record)) {
      const candidate = publicRecord(record, category);
      const key = `${candidate.project_id}|${category}`;
      const existing = projectCategory.get(key);
      if (!existing || candidate.issue_date < existing.issue_date) projectCategory.set(key, candidate);
    }
  }

  const records = [...projectCategory.values()].sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.category.localeCompare(b.category));
  const categories = CATEGORY_DEFINITIONS.map((definition) => {
    const categoryRecords = records.filter((record) => record.category === definition.name);
    const elapsed = categoryRecords.map((record) => record.elapsed_calendar_days).filter(Number.isFinite);
    return {
      category: definition.name,
      issued_projects: categoryRecords.length,
      projects_with_elapsed_days: elapsed.length,
      median_elapsed_calendar_days: median(elapsed),
      p25_elapsed_calendar_days: percentile(elapsed, 0.25),
      p75_elapsed_calendar_days: percentile(elapsed, 0.75)
    };
  }).filter((row) => row.issued_projects > 0);

  const lastIssueDate = records.reduce((latest, record) => record.issue_date > latest ? record.issue_date : latest, "");
  const lastMonth = lastIssueDate.slice(0, 7);
  const months = Array.from({ length: Number(lastMonth.slice(5, 7)) }, (_, index) => `2026-${String(index + 1).padStart(2, "0")}`);
  const monthly = months.flatMap((month) => categories.map(({ category }) => ({
    month,
    category,
    issued_projects: records.filter((record) => record.issue_month === month && record.category === category).length
  })));

  const relevantProjects = new Set(records.map((record) => record.project_id));
  const projectElapsed = new Map();
  for (const record of records) {
    if (!Number.isFinite(record.elapsed_calendar_days)) continue;
    const existing = projectElapsed.get(record.project_id);
    if (!Number.isFinite(existing) || record.elapsed_calendar_days < existing) {
      projectElapsed.set(record.project_id, record.elapsed_calendar_days);
    }
  }
  const allElapsed = [...projectElapsed.values()];
  const costs = costData.records
    .filter((record) => record.scope === "city" && record.metro === "San Diego")
    .map((record) => ({
      category: record.project,
      low_usd: record.low_usd,
      high_usd: record.high_usd,
      price_basis: "total_project_planning_range"
    }))
    .sort((a, b) => a.low_usd - b.low_usd);

  const summary = {
    title: "San Diego Renovation Permit & Cost Pulse",
    edition: "2026 year to date",
    generated_at: retrievedAt,
    city_source_last_modified: cityLastModified ? dateOnly(new Date(cityLastModified)) : null,
    last_issue_date_in_analysis: lastIssueDate,
    relevant_unique_projects: relevantProjects.size,
    project_category_observations: records.length,
    projects_with_elapsed_days: allElapsed.length,
    median_elapsed_calendar_days: median(allElapsed),
    categories,
    monthly,
    costs,
    sources: {
      city_dataset_page: CITY_DATASET_PAGE,
      city_csv: CITY_DATA_URL,
      city_terms: CITY_TERMS_URL,
      renology_cost_data: RENOLOGY_DATA_URL,
      renology_cost_index: RENOLOGY_COST_INDEX,
      renology_methodology: RENOLOGY_METHODOLOGY
    },
    methodology: {
      unit: "Unique City project ID within each keyword category, using the earliest 2026 issue date among matching Building Permit or Combination Building Permit approvals.",
      residential_filter: "Records must contain explicit residential evidence in the building-code description or public project/approval text.",
      category_overlap: "A project may appear in more than one category when its public text explicitly names multiple scopes.",
      elapsed_metric: "Calendar days from the City project-create date to the earliest matching issued approval. It is not City staff processing time, construction duration, or a service-level promise.",
      privacy: "Only aggregate outputs are published. Addresses, coordinates, permit holders, scopes, and project-level rows are not redistributed.",
      cost_separation: "Renology planning cost ranges are shown separately. They are not permit valuations and are not joined to City permit records."
    },
    disclosure: "Renology publishes renovation guidance and operates a private contractor-matching service. The City of San Diego does not endorse Renology or this analysis."
  };

  const categoryColumns = ["category", "issued_projects", "projects_with_elapsed_days", "median_elapsed_calendar_days", "p25_elapsed_calendar_days", "p75_elapsed_calendar_days"];
  const monthlyColumns = ["month", "category", "issued_projects"];
  const costColumns = ["category", "low_usd", "high_usd", "price_basis"];

  await mkdir("data", { recursive: true });
  await mkdir(path.join("docs", "data"), { recursive: true });
  const outputs = [
    ["summary.json", `${JSON.stringify(summary, null, 2)}\n`],
    ["category-summary.csv", toCsv(categories, categoryColumns)],
    ["monthly-category-counts.csv", toCsv(monthly, monthlyColumns)],
    ["san-diego-cost-ranges.csv", toCsv(costs, costColumns)]
  ];

  for (const [filename, contents] of outputs) {
    await writeFile(path.join("data", filename), contents);
    await writeFile(path.join("docs", "data", filename), contents);
  }

  console.log(`Built ${records.length} category observations across ${relevantProjects.size} unique projects; source rows: ${cityRows.length}.`);
}

await main();
