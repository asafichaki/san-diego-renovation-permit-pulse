const number = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, notation: "compact" });
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const colors = ["#194c3b", "#ff765e", "#6d9dff", "#e6b94b", "#7d6ca8"];

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function renderCategories(rows) {
  const max = Math.max(...rows.map((row) => row.issued_projects));
  document.getElementById("category-chart").innerHTML = rows.map((row, index) => `
    <div class="chart-row">
      <div class="chart-label"><strong>${row.category}</strong><span>${number.format(row.median_elapsed_calendar_days)} median days</span></div>
      <div class="bar-track"><div class="bar" style="width:${Math.max(2, row.issued_projects / max * 100)}%;background:${colors[index % colors.length]}"></div></div>
      <div class="chart-value">${number.format(row.issued_projects)} projects</div>
    </div>
  `).join("");
}

function renderMonths(rows) {
  const grouped = rows.reduce((months, row) => {
    (months[row.month] ||= []).push(row);
    return months;
  }, {});
  const totals = Object.values(grouped).map((monthRows) => monthRows.reduce((sum, row) => sum + row.issued_projects, 0));
  const max = Math.max(...totals);
  document.getElementById("monthly-chart").innerHTML = Object.entries(grouped).map(([month, monthRows]) => {
    const total = monthRows.reduce((sum, row) => sum + row.issued_projects, 0);
    const height = Math.max(10, total / max * 240);
    return `<div class="month-column">
      <div class="month-total">${number.format(total)}</div>
      <div class="month-stack" style="height:${height}px">${monthRows.map((row, index) => `<div class="month-segment" title="${row.category}: ${row.issued_projects}" style="height:${total ? row.issued_projects / total * 100 : 0}%;background:${colors[index % colors.length]}"></div>`).join("")}</div>
      <div class="month-label">${new Date(`${month}-02T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</div>
    </div>`;
  }).join("");
}

function renderCosts(rows) {
  document.getElementById("cost-grid").innerHTML = rows.map((row) => `
    <article class="cost-card"><span>${row.category}</span><strong>${money.format(row.low_usd)}–${money.format(row.high_usd)}</strong></article>
  `).join("");
}

async function load() {
  try {
    const response = await fetch("data/summary.json");
    if (!response.ok) throw new Error(`Snapshot request returned ${response.status}`);
    const data = await response.json();

    setText("stat-projects", number.format(data.relevant_unique_projects));
    setText("stat-median", `${number.format(data.median_elapsed_calendar_days)} days`);
    setText("stat-observations", number.format(data.project_category_observations));
    setText("stat-latest", shortDate.format(new Date(`${data.last_issue_date_in_analysis}T00:00:00Z`)));
    setText("source-stamp", `City source updated ${data.city_source_last_modified}; analysis generated ${data.generated_at}.`);
    renderCategories(data.categories);
    renderMonths(data.monthly);
    renderCosts(data.costs);
  } catch (error) {
    document.getElementById("category-chart").innerHTML = `<p class="error">The published snapshot could not be loaded. Use the direct downloads below or view the repository.</p>`;
    console.error(error);
  }
}

load();
