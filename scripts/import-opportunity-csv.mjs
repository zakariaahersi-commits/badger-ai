import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
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
  return rows;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const source = resolve(process.argv[2] || "clone_radar_crosscheck.csv");
const destination = resolve(process.argv[3] || "data/opportunities.json");
const rows = parseCsv(await readFile(source, "utf8"));
const headers = rows.shift() || [];
const records = rows.flatMap((values) => {
  const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  const title = String(record.idea || "").trim();
  if (!title) return [];
  return [{
    id: createHash("sha256").update(`${title}|${record.url}`).digest("hex").slice(0, 16),
    title,
    category: String(record.category || "other").trim().slice(0, 80),
    action: number(record.action),
    roi: number(record.roi),
    ease: number(record.ease),
    cost: number(record.cost),
    tier: String(record.tier || "").trim().slice(0, 40),
    analogousProduct: String(record.best_analog || "").trim().slice(0, 160) || null,
    analogousMonthlyRevenue: number(record.best_analog_mrr),
    sourceUrl: String(record.url || "").trim().slice(0, 500) || null,
  }];
});

await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(records)}\n`, "utf8");
console.log(`Imported ${records.length} opportunities to ${destination}`);
