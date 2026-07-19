# San Diego Renovation Permit & Cost Pulse

A reproducible, privacy-preserving analysis of 2026 renovation-related projects in the City of San Diego's public approvals data, paired with **separate** Renology total-project planning cost ranges.

The public dashboard is designed as a citation-ready civic-data brief. It does not contain homeowner leads, contractor records, permit-holder names, addresses, coordinates, project scopes, or project-level rows.

## Live dashboard

https://asafichaki.github.io/san-diego-renovation-permit-pulse/

Zero-install documentation access for compatible AI clients:

https://gitmcp.io/asafichaki/san-diego-renovation-permit-pulse

Responsive embed for local publishers and newsletters:

```html
<iframe src="https://asafichaki.github.io/san-diego-renovation-permit-pulse/embed.html" title="San Diego renovation permit pulse" width="100%" height="480" loading="lazy" style="border:0;max-width:760px"></iframe>
```

See the [press and reuse kit](PRESS-KIT.md) for defensible findings, story angles, source links, and interpretation guardrails.

## Key interpretation

- The unit is a unique City `PROJECT_ID` within each keyword category, using the earliest matching 2026 issue date.
- Categories can overlap when a public project explicitly names multiple scopes.
- “Elapsed calendar days” runs from the City project-create date to the earliest matching issued approval. It is **not** City staff processing time, construction duration, or a promise for a new application.
- Renology cost bands are shown separately. They are not permit valuations, observed transaction prices, bids, quotes, or guarantees.
- The City of San Diego does not endorse Renology or this analysis.

## Reproduce

Requires Node.js 20 or newer and no third-party packages.

```bash
npm run build
npm test
```

The build downloads the current 2026 issued-approvals CSV, keeps only relevant Building Permit and Combination Building Permit records with explicit residential evidence, assigns keyword categories, deduplicates by project/category, and writes aggregate CSV/JSON outputs. The raw source is not committed.

## Published outputs

- [`data/summary.json`](data/summary.json)
- [`data/category-summary.csv`](data/category-summary.csv)
- [`data/monthly-category-counts.csv`](data/monthly-category-counts.csv)
- [`data/san-diego-cost-ranges.csv`](data/san-diego-cost-ranges.csv)

## Primary sources

- City dataset: https://data.sandiego.gov/datasets/development-permits/
- City interpretation guide: https://data.sandiego.gov/help/articles/tips-permits-approvals-housing/
- City terms: https://data.sandiego.gov/help/guides/terms/
- Renology Cost Index: https://www.therenology.com/cost-index
- Renology methodology: https://www.therenology.com/methodology

## Commercial disclosure

[Renology](https://www.therenology.com/) publishes renovation guidance and operates a private contractor-matching service. Cost figures are publisher-maintained planning benchmarks. Contractors cannot pay to change a published range or the methodology. This project is first-party analysis, not independent editorial validation.

## License and source terms

- Original code and dashboard: [MIT](LICENSE)
- Generated aggregate outputs: see [DATA-NOTICE.md](DATA-NOTICE.md) and the source terms linked there.
