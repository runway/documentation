#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(SCRIPT_PATH));

const GENERATED_TARGETS = {
  functions: {
    marker: "functions",
    pagePath: "concepts/formulas/functions-operators.mdx",
    render: renderFunctions,
  },
  shortcuts: {
    marker: "shortcuts",
    pagePath: "get-started/keyboard-shortcuts.mdx",
    render: renderShortcuts,
  },
  roles: {
    marker: "roles",
    pagePath: "reference/roles-and-access.mdx",
    render: renderRoles,
  },
  integrations: {
    marker: "integrations",
    pagePath: "reference/integration-catalog.mdx",
    render: renderIntegrations,
  },
};

const DATE_UNIT_DESCRIPTION =
  'Valid units are "d", "m", "w", "q", "y" (days, months, weeks, quarters, years).';

const INTERNAL_FORMULA_NAMES = new Set(["asDays()", "asWeeks()", "asMonths()", "asYears()"]);

const FUNCTION_CATEGORY_ORDER = [
  "Aggregation",
  "Math & rounding",
  "Date calculation",
  "Date access",
  "Logic & error handling",
];

const FUNCTION_CATEGORIES = new Map(
  [
    ["sum()", "Aggregation"],
    ["sumProduct()", "Aggregation"],
    ["count()", "Aggregation"],
    ["avg()", "Aggregation"],
    ["min()", "Aggregation"],
    ["max()", "Aggregation"],
    ["first()", "Aggregation"],
    ["firstValue()", "Aggregation"],
    ["last()", "Aggregation"],
    ["lastValue()", "Aggregation"],
    ["single()", "Aggregation"],
    ["round()", "Math & rounding"],
    ["roundDown()", "Math & rounding"],
    ["roundUp()", "Math & rounding"],
    ["floor()", "Math & rounding"],
    ["ceiling()", "Math & rounding"],
    ["power()", "Math & rounding"],
    ["exp()", "Math & rounding"],
    ["log()", "Math & rounding"],
    ["ln()", "Math & rounding"],
    ["dateDiff()", "Date calculation"],
    ["dateAdd()", "Date calculation"],
    ["dateSub()", "Date calculation"],
    ["netWorkDays()", "Date calculation"],
    ["startOfMonth()", "Date access"],
    ["endOfMonth()", "Date access"],
    ["thisMonth()", "Date access"],
    ["lastMonth()", "Date access"],
    ["thisQuarter()", "Date access"],
    ["lastQuarter()", "Date access"],
    ["thisYear()", "Date access"],
    ["lastYear()", "Date access"],
    ["daysInMonth()", "Date access"],
    ["year()", "Date access"],
    ["quarter()", "Date access"],
    ["month()", "Date access"],
    ["weeknum()", "Date access"],
    ["day()", "Date access"],
    ["if()", "Logic & error handling"],
    ["ifError()", "Logic & error handling"],
    ["coalesce()", "Logic & error handling"],
    ["and()", "Logic & error handling"],
    ["or()", "Logic & error handling"],
  ],
);

const FUNCTION_NOTES = {
  "sumProduct()":
    "Both references must have the same number of entries and corresponding dimensional segments.",
  "round()":
    "Coarser rounding than the ones place is not supported; do not use negative values for `[places]`.",
  "roundUp()":
    "`-roundDown(-value)` produces the same round-up behavior and can help when reading older formulas.",
  "dateDiff()": "If the result is negative, consider flipping `start_date` and `end_date`.",
  "dateAdd()": "This returns a date. Use a Date driver when the formula result should be a date.",
  "dateSub()": "This returns a date. Use a Date driver when the formula result should be a date.",
  "if()":
    "The condition must be a logical expression, such as `1 == 1`. Values can be nested formula expressions.",
  "ifError()": "This does not suppress circular-reference (`CIRC`) errors.",
  "coalesce()":
    "Filtered pills that return zero results are treated as null. This is useful for switch-style logic.",
  "and()": "Use parentheses to make nested logic easier to read.",
  "or()": "Use parentheses to make nested logic easier to read.",
};

const FORMULA_DESCRIPTION_RENDER_FIXES = new Map([
  ["exclusing", "excluding"],
  ["'0000077'", "'0000011'"],
]);

const AGGREGATION_EXAMPLES = {
  "sum()": "`sum(Employees.Salary)`",
  "sumProduct()": "`sumProduct(Deals.Quantity, Deals.UnitPrice)`",
  "count()": "`count(Employees.Name)`",
  "avg()": "`avg(Employees.Salary)`",
  "min()": "`min(Deals.ContractValue)`",
  "max()": "`max(Deals.ContractValue)`",
  "first()": "`first(HeadcountByDepartment)`",
  "firstValue()": "`firstValue(RevenueByRegion)`",
  "last()": "`last(RevenueByRegion)`",
  "lastValue()": "`lastValue(RevenueByRegion)`",
  "single()": "`single(Employees.Department)`",
};

const OPERATOR_ROWS = [
  {
    operator: "`+`",
    usage: "`value1 + value2`",
    description: "Adds two values.",
  },
  {
    operator: "`-`",
    usage: "`value1 - value2`",
    description: "Subtracts the second value from the first.",
  },
  {
    operator: "`*`",
    usage: "`value1 * value2`",
    description: "Multiplies two values.",
  },
  {
    operator: "`/`",
    usage: "`value1 / value2`",
    description: "Divides the first value by the second.",
  },
  {
    operator: "`%`",
    usage: "`value1 % value2`",
    description: "Returns the remainder when `value1` is divided by `value2`.",
  },
  {
    operator: "`^`",
    usage: "`base ^ exponent`",
    description: "Raises `base` to `exponent`.",
  },
  {
    operator: "`==`",
    usage: "`value1 == value2`",
    description: "Checks whether two values are equal.",
    note:
      "Date comparisons work. For example, `if(thisMonth() == '2025-01-01', 1, 0)` returns 1 in January 2025.",
  },
  {
    operator: "`!=`",
    usage: "`value1 != value2`",
    description: "Checks whether two values are not equal.",
    note:
      "Date comparisons work. For example, `if(thisMonth() != '2025-01-01', 1, 0)` returns 1 outside January 2025.",
  },
  {
    operator: "`>`",
    usage: "`value1 > value2`",
    description: "Checks whether the first value is greater than the second.",
    note:
      "Date comparisons work. For example, `if(thisMonth() > '2025-01-01', 1, 0)` returns 1 after January 2025.",
  },
  {
    operator: "`<`",
    usage: "`value1 < value2`",
    description: "Checks whether the first value is less than the second.",
    note:
      "Date comparisons work. For example, `if(thisMonth() < '2025-01-01', 1, 0)` returns 1 before January 2025.",
  },
  {
    operator: "`>=`",
    usage: "`value1 >= value2`",
    description: "Checks whether the first value is greater than or equal to the second.",
    note:
      "Date comparisons work. For example, `if(thisMonth() >= '2025-01-01', 1, 0)` returns 1 in or after January 2025.",
  },
  {
    operator: "`<=`",
    usage: "`value1 <= value2`",
    description: "Checks whether the first value is less than or equal to the second.",
    note:
      "Date comparisons work. For example, `if(thisMonth() <= '2025-01-01', 1, 0)` returns 1 in or before January 2025.",
  },
  {
    operator: "`(` and `)`",
    usage: "`(condition1 AND condition2)`",
    description: "Groups calculations or logical expressions.",
  },
];

const SHORTCUT_METADATA = {
  delete: ["Editing & formatting", "Delete selected content or remove the selected driver from a block"],
  shiftDelete: ["Editing & formatting", "Delete the selected driver or item"],
  indent: ["Drivers & grids", "Indent the selected driver"],
  outdent: ["Drivers & grids", "Outdent the selected driver"],
  bold: ["Editing & formatting", "Bold selected text"],
  underline: ["Editing & formatting", "Underline selected text"],
  italic: ["Editing & formatting", "Italicize selected text"],
  strike: ["Editing & formatting", "Strike selected text (in text)"],
  enter: ["Drivers & grids", "Edit the selected cell, or save the active cell edit"],
  shiftEnter: ["Drivers & grids", "Open the plan picker in grids"],
  metaEnter: ["Drivers & grids", "Toggle drill-in in driver grids"],
  metaOptionEnter: ["Drivers & grids", "Collapse the parent drill-in in driver grids"],
  escape: ["General", "Close the active overlay or clear the current keyboard state"],
  duplicate: ["Drivers & grids", "Duplicate the selected driver"],
  search: ["Navigation", "Open search"],
  merge: ["Blocks & pages", "Merge the selected scenario"],
  details: ["Navigation", "Open the selected item's detail view"],
  hide: ["Drivers & grids", "Hide the selected drivers or rows"],
  group: ["Drivers & grids", "Group selected drivers"],
  detailPageUp: ["Navigation", "Move to the previous item in the detail pane"],
  detailPageDown: ["Navigation", "Move to the next item in the detail pane"],
  objectInspector: ["General", "Open Object Inspector"],
  toggleName: ["Drivers & grids", "Hide or show driver names"],
  toggleSegmentStyle: ["Drivers & grids", "Hide or show segment attributes"],
  toggleDriverFormat: ["Drivers & grids", "Toggle driver formatting"],
  toggleForecastFormula: ["Formulas", "Hide or show the Forecast Formula column"],
  toggleActualsFormula: ["Formulas", "Hide or show the Actuals Formula column"],
  togglePinnedFormulas: ["Formulas", "Pin or unpin formula columns"],
  reload: ["General", "Reload from the refresh notice"],
  undo: ["Editing & formatting", "Undo the latest change"],
  redo: ["Editing & formatting", "Redo the latest change"],
  redoWindows: ["Editing & formatting", "Redo the latest change on Windows"],
  tab: ["Navigation", "Move to the next cell"],
  shiftTab: ["Navigation", "Move to the previous cell"],
  incrementPrecision: ["Editing & formatting", "Increase decimal precision"],
  decrementPrecision: ["Editing & formatting", "Decrease decimal precision"],
  selectAll: ["Editing & formatting", "Select all"],
  developerMenu: ["General", "Open the developer menu for Runway employees"],
  metaShiftB: ["Drivers & grids", "Add selected drill-in drivers to the block"],
  revealInSidebar: ["Navigation", "Reveal the current page in the sidebar (in grids and pages)"],
  up: ["Navigation", "Move up"],
  down: ["Navigation", "Move down"],
  metaUp: ["Navigation", "Move to the top edge of the current region"],
  metaDown: ["Navigation", "Move to the bottom edge of the current region"],
  shiftUp: ["Navigation", "Extend selection up"],
  shiftDown: ["Navigation", "Extend selection down"],
  metaShiftUp: ["Navigation", "Extend selection to the top edge of the current region"],
  metaShiftDown: ["Navigation", "Extend selection to the bottom edge of the current region"],
  left: ["Navigation", "Move left"],
  right: ["Navigation", "Move right"],
  metaLeft: ["Navigation", "Move to the left edge of the current region"],
  metaRight: ["Navigation", "Move to the right edge of the current region"],
  shiftLeft: ["Navigation", "Extend selection left"],
  shiftRight: ["Navigation", "Extend selection right"],
  metaShiftLeft: ["Navigation", "Extend selection to the left edge of the current region"],
  metaShiftRight: ["Navigation", "Extend selection to the right edge of the current region"],
  insertAbove: ["Drivers & grids", "Insert a driver above the current selection"],
  insertBelow: ["Drivers & grids", "Insert a driver below the current selection"],
  toggleSidebar: ["Navigation", "Collapse or expand the sidebar"],
};

const OMITTED_SHORTCUT_KEYS = new Set(["metaOptionB"]);

const SHORTCUT_CATEGORY_ORDER = [
  "Navigation",
  "Editing & formatting",
  "Drivers & grids",
  "Formulas",
  "Blocks & pages",
  "General",
];

const ROLE_ORDER = ["Owner", "Admin", "Manager", "Member", "Guest", "Anonymous user"];
const ACCESS_RULE_LABELS = {
  Full: "Full access",
  Write: "Can edit",
  Read: "Can view",
  Revoked: "No access",
  Create: "Can create",
  Merge: "Can merge",
  Export: "Can export",
  Delete: "Can delete",
  Share: "Can share",
  Compare: "Can compare",
  DrillIn: "Can drill in",
  Execute: "Can execute",
};

const RESOURCE_LABELS = {
  All: "All resources",
  LayerResources: "Scenario resources",
  IntegrationLinkedAccount: "Integration",
  IntegrationQuery: "Integration query",
  IntegrationSchema: "Integration schema",
  IntegrationTable: "Integration table",
  IntegrationTableColumn: "Integration table column",
  Dimension: "Dimension",
  Folder: "Section",
  UnlistedDrivers: "Unlisted drivers",
  AccessControl: "Access control",
  EntityAnonymization: "Entity anonymization",
  LayerMetadata: "Scenario",
  CollectionProperty: "Database column",
  ExtDrivers: "External driver",
  DatabaseLookups: "Database lookups",
  Search: "Search",
};

const ACCESS_LEVEL_ROWS = [
  ["Pages", "Full access", "Can edit, delete, and share the page."],
  ["Pages", "Can edit", "Can edit page content, but not share or delete the page."],
  ["Pages", "Can view", "Can view the page but can not edit or add other users."],
  ["Pages", "No access", "Cannot view or access the page."],
  ["Sections", "Full access", "Can edit, delete, and share this section."],
  ["Sections", "Can view", "Can view this section and its contents."],
  ["Sections", "No access", "Cannot view this section."],
  ["Blocks", "Full access", "Can edit, delete, and share this block."],
  ["Blocks", "Can view", "Can view this block and its contents."],
  ["Blocks", "Can drill in", "Allow people to drill in to see the inputs for a given row."],
  ["Blocks", "No access", "Cannot view this block."],
  ["Scenarios", "Full access", "Can edit, delete, merge, and share this scenario."],
  ["Scenarios", "Can view", "Can view this scenario."],
  ["Scenarios", "Can merge", "Allow people to merge this scenario."],
  ["Scenarios", "No access", "Cannot view this scenario."],
  ["Database columns", "Can view", "Can view this column's data."],
  ["Database columns", "No access", "Cannot view this column's data."],
];

const MULTI_ACCOUNT_SLUGS = new Set(["xero", "quickbooks-online", "zenefits", "paycor"]);
const SQL_SOURCE_KEYS = new Set([
  "FIVETRAN_GOOGLE_SHEETS",
  "FIVETRAN_HUBSPOT",
  "FIVETRAN_NETSUITE_SUITEANALYTICS",
  "FIVETRAN_SALESFORCE",
  "FIVETRAN_XERO",
  "WORKATO_REDSHIFT",
  "WORKATO_SNOWFLAKE",
  "WORKATO_NETSUITE",
  "WORKATO_GOOGLE_BIG_QUERY",
]);
const MERGE_PASSTHROUGH_SQL_SLUGS = new Set(["xero", "quickbooks-online"]);

const WORKATO_DISPLAY = {
  airtable: "Airtable",
  amazon_s3: "Amazon S3",
  aws_cost_explorer: "AWS Cost Explorer",
  azure_blob_storage: "Azure Blob Storage",
  chargebee_admin: "Chargebee",
  coupa: "Coupa",
  facebook_lead_ads: "Facebook Lead Ads",
  hubspot: "HubSpot",
  hubspot_default: "HubSpot default",
  google_ads: "Google Ads",
  google_analytics: "Google Analytics",
  google_big_query: "Google BigQuery",
  google_sheets: "Google Sheets",
  looker: "Looker",
  workato_netsuite: "NetSuite",
  oracle: "Oracle",
  oracle_financials_cloud: "Oracle Financials Cloud",
  pipedrive: "Pipedrive",
  ramp: "Ramp",
  redshift: "Redshift",
  rest: "REST",
  salesforce: "Salesforce",
  snowflake: "Snowflake",
  stripe: "Stripe",
  tableau: "Tableau",
  zuora: "Zuora",
};

const INTEGRATION_CATEGORY_OVERRIDES = {
  "quickbooks-online": "Accounting",
  xero: "Accounting",
  netsuite_suiteanalytics: "Accounting",
  workato_netsuite: "Accounting",
  puzzle: "Accounting",
  rippling: "HRIS",
  hubspot: "Revenue & CRM",
  hubspot_default: "Revenue & CRM",
  salesforce: "Revenue & CRM",
  pipedrive: "Revenue & CRM",
  google_sheets: "Data storage & warehouses",
  google_big_query: "Data storage & warehouses",
  redshift: "Data storage & warehouses",
  snowflake: "Data storage & warehouses",
  amazon_s3: "Data storage & warehouses",
  azure_blob_storage: "Data storage & warehouses",
  airtable: "Data storage & warehouses",
  "file-upload": "Data storage & warehouses",
  "runway-api": "Data storage & warehouses",
  rest: "Data storage & warehouses",
};

const INTEGRATION_CATEGORY_ORDER = [
  "Accounting",
  "HRIS",
  "Revenue & CRM",
  "Data storage & warehouses",
  "Other",
];

function requireMatch(value, regex, label) {
  const match = value.match(regex);
  if (!match) {
    throw new Error(`Could not find ${label}; source shape may have changed.`);
  }
  return match;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedIncludes(haystack, needle) {
  return normalizeWhitespace(haystack).includes(normalizeWhitespace(needle));
}

export function applyFormulaDescriptionRenderFixes(value) {
  let fixed = value;
  for (const [search, replacement] of FORMULA_DESCRIPTION_RENDER_FIXES) {
    fixed = fixed.replaceAll(search, replacement);
  }
  return fixed;
}

function stripTrailingNewline(value) {
  return value.replace(/\n+$/g, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\n/g, "<br />")
    .replace(/\|/g, "\\|");
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.map(markdownCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
  ].join("\n");
}

export function replaceGeneratedBlock(page, markerName, generatedContent) {
  const marker = escapeRegExp(markerName);
  const regex = new RegExp(
    `(\\{\\/\\* GENERATED:${marker} START \\*\\/\\}\\n)([\\s\\S]*?)(\\{\\/\\* GENERATED:${marker} END \\*\\/\\})`,
  );
  const match = page.match(regex);
  if (!match) {
    throw new Error(`Missing GENERATED:${markerName} marker block.`);
  }
  return page.replace(regex, `$1${stripTrailingNewline(generatedContent)}\n$3`);
}

export async function checkGeneratedBlock(pagePath, markerName, generatedContent) {
  const original = await readFile(pagePath, "utf8");
  const updated = replaceGeneratedBlock(original, markerName, generatedContent);
  if (updated === original) {
    return { ok: true, message: `${pagePath} is up to date.` };
  }
  return { ok: false, message: `${pagePath} has generated reference drift.` };
}

async function updateGeneratedBlock(pagePath, markerName, generatedContent) {
  const original = await readFile(pagePath, "utf8");
  const updated = replaceGeneratedBlock(original, markerName, generatedContent);
  if (updated !== original) {
    await writeFile(pagePath, updated);
  }
  return updated !== original;
}

function readBalancedBlock(source, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let escaping = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote != null) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex, index + 1);
      }
    }
  }

  throw new Error(`Could not find closing ${closeChar}.`);
}

function extractAssignedBlock(source, assignmentName, openChar = "[", closeChar = "]") {
  const declarationPattern = new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${escapeRegExp(assignmentName)}\\b`);
  const declaration = source.match(declarationPattern);
  const start = declaration?.index ?? source.indexOf(assignmentName);
  if (start === -1) {
    throw new Error(`Could not find ${assignmentName}; source shape may have changed.`);
  }
  const assignmentIndex = source.indexOf("=", start);
  if (assignmentIndex === -1) {
    throw new Error(`Could not find ${assignmentName} assignment.`);
  }
  const openIndex = source.indexOf(openChar, assignmentIndex);
  if (openIndex === -1) {
    throw new Error(`Could not find ${assignmentName} opening ${openChar}.`);
  }
  return readBalancedBlock(source, openIndex, openChar, closeChar);
}

function splitTopLevelObjects(arrayLiteral) {
  const inner = arrayLiteral.slice(1, -1);
  const objects = [];
  for (let index = 0; index < inner.length; index += 1) {
    if (inner[index] !== "{") {
      continue;
    }
    const object = readBalancedBlock(inner, index, "{", "}");
    objects.push(object);
    index += object.length - 1;
  }
  return objects;
}

function decodeStringLiteral(rawValue) {
  return rawValue
    .slice(1, -1)
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\`/g, "`")
    .replace(/\\n/g, "\n");
}

function decodeStringExpression(expression) {
  const values = [];
  const regex = /(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  for (const match of expression.matchAll(regex)) {
    values.push(decodeStringLiteral(`${match[1]}${match[2]}${match[1]}`));
  }
  if (values.length === 0) {
    const templateMatch = expression.match(/`([\s\S]*?)`/);
    if (templateMatch) {
      return templateMatch[1];
    }
  }
  return values.join("");
}

function extractSubtitle(block, title) {
  if (
    title === "dateDiff(start_date, end_date, unit)" ||
    title === "dateAdd(date, quantity, unit)" ||
    title === "dateSub(date, quantity, unit)"
  ) {
    const prefix =
      title === "dateDiff(start_date, end_date, unit)"
        ? 'Returns the number of whole "units" between the start_date and end_date.'
        : title === "dateAdd(date, quantity, unit)"
          ? "Returns the sum of the date plus the quantity in units."
          : "Returns the sum of the date minus the quantity in units.";
    return `${prefix} ${DATE_UNIT_DESCRIPTION}`;
  }

  const subtitleIndex = block.indexOf("subtitle:");
  if (subtitleIndex === -1) {
    throw new Error(`Missing subtitle for ${title}.`);
  }
  const expression = block.slice(subtitleIndex + "subtitle:".length, block.indexOf("\n    },", subtitleIndex));
  return applyFormulaDescriptionRenderFixes(normalizeWhitespace(decodeStringExpression(expression)));
}

function extractFormulaItems(source) {
  const arrayLiteral = extractAssignedBlock(source, "MATH_OPERATOR_SELECT_ITEMS");
  const items = splitTopLevelObjects(arrayLiteral).map((block) => {
    const operator = requireMatch(block, /operator:\s*MathOperator\.([A-Za-z0-9_]+)/, "formula operator")[1];
    const name = requireMatch(block, /name:\s*'([^']+)'/, `formula name for ${operator}`)[1];
    const title = requireMatch(block, /title:\s*'([^']+)'/, `formula signature for ${name}`)[1];
    return {
      operator,
      name,
      signature: title,
      description: extractSubtitle(block, title),
    };
  });

  if (items.length < 30) {
    throw new Error(`Expected at least 30 formula items, found ${items.length}.`);
  }

  return items.filter((item) => !INTERNAL_FORMULA_NAMES.has(item.name) && item.name !== "%");
}

function extractOperatorLabels(source) {
  const objectLiteral = extractAssignedBlock(source, "MATH_OPERATOR_TO_LABEL", "{", "}");
  const labels = new Map();
  const regex = /\[MathOperator\.([A-Za-z0-9_]+)\]:\s*\['([^']*)',\s*'([^']*)'\]/g;
  for (const match of objectLiteral.matchAll(regex)) {
    labels.set(match[1], [match[2], match[3]]);
  }
  for (const required of ["Add", "Subtract", "Multiply", "Divide", "Modulo", "Pow", "Equals"]) {
    if (!labels.has(required)) {
      throw new Error(`Missing MathOperator.${required} in MATH_OPERATOR_TO_LABEL.`);
    }
  }
  return labels;
}

async function renderFunctions(runwayRepo) {
  const source = await readProductFile(runwayRepo, "webapp/src/config/formula.ts");
  const operatorLabels = extractOperatorLabels(source);
  const formulaItems = extractFormulaItems(source);
  const byCategory = new Map(FUNCTION_CATEGORY_ORDER.map((category) => [category, []]));
  const specialItems = [];

  for (const item of formulaItems) {
    if (item.name === "lastClose()") {
      specialItems.push(item);
      continue;
    }
    const category = FUNCTION_CATEGORIES.get(item.name);
    if (!category) {
      throw new Error(`No docs category configured for formula item ${item.name}.`);
    }
    byCategory.get(category).push(item);
  }

  const output = [];
  output.push("## Operators");
  output.push("");
  output.push(renderOperatorsTable(operatorLabels));
  output.push("");

  for (const category of FUNCTION_CATEGORY_ORDER) {
    output.push(`## ${category}`);
    output.push("");
    output.push(renderFunctionTable(byCategory.get(category)));
    output.push("");
  }

  output.push("## Time-unit conversion");
  output.push("");
  output.push(
    "No public time-unit conversion functions are exposed in the formula autocomplete registry.",
  );
  output.push("");

  output.push("## Special keywords");
  output.push("");
  output.push(renderSpecialFormulaTable(specialItems));

  return `${output.join("\n")}\n`;
}

function renderOperatorsTable(operatorLabels) {
  for (const row of OPERATOR_ROWS) {
    const token = row.operator.replace(/`/g, "").split(" ")[0];
    if (token.length === 1 || token === "==" || token === "!=" || token === ">=" || token === "<=") {
      const exists = [...operatorLabels.values()].some(([prefix]) => prefix === token);
      if (!exists && token !== "(") {
        throw new Error(`Operator token ${token} was not found in MATH_OPERATOR_TO_LABEL.`);
      }
    }
  }

  return markdownTable(
    ["Operator", "Usage", "Description", "Things to keep in mind"],
    OPERATOR_ROWS.map((row) => [row.operator, row.usage, row.description, row.note ?? ""]),
  );
}

function renderFunctionTable(items) {
  return markdownTable(
    ["Function", "Signature", "Description", "Example", "Things to keep in mind"],
    items.map((item) => [
      `\`${item.name}\``,
      `\`${item.signature}\``,
      item.description,
      AGGREGATION_EXAMPLES[item.name] ?? "",
      FUNCTION_NOTES[item.name] ?? "",
    ]),
  );
}

function renderSpecialFormulaTable(specialItems) {
  const lastClose = specialItems.find((item) => item.name === "lastClose()");
  if (!lastClose) {
    throw new Error("Expected lastClose() in formula registry.");
  }

  return markdownTable(
    ["Item", "Where it appears", "Description", "Things to keep in mind"],
    [
      ["`NULL`", "Values section", "Represents the NULL value.", ""],
      [
        "`this.` / This Segment",
        "This Segment and This Database autocomplete sections",
        "References the current segment or database row context when matching dimensions and database fields.",
        "Use this for formulas that should adapt across segments instead of hardcoding each filter.",
      ],
      [
        "`lastClose()`",
        "Function autocomplete",
        lastClose.description,
        "Use it when a formula should anchor to the last closed month rather than the month currently being evaluated.",
      ],
      [
        "Relative date references",
        "Date filters on formula references",
        "Includes This month, Last month, Last close, One year ago, Quarter-to-date, Year-to-date, and rolling actuals ranges.",
        "References with multi-month ranges usually need an aggregation function such as `sum()`, `avg()`, or `max()`.",
      ],
    ],
  );
}

function parseShortcutModifiers(rawModifiers = "") {
  return {
    meta: /\bmeta:\s*true\b/.test(rawModifiers),
    ctrl: /\bctrl:\s*true\b/.test(rawModifiers),
    shift: /\bshift:\s*true\b/.test(rawModifiers),
    option: /\boption:\s*true\b/.test(rawModifiers),
  };
}

function shortcutKeysForPlatform(selection, modifiers, platform) {
  const keys = [];
  if (modifiers.meta) {
    keys.push(platform === "mac" ? "⌘" : "Ctrl");
  }
  if (modifiers.ctrl) {
    keys.push(platform === "mac" ? "⌃" : "Ctrl");
  }
  if (modifiers.option) {
    keys.push(platform === "mac" ? "⌥" : "Alt");
  }
  if (modifiers.shift) {
    keys.push("⇧");
  }
  keys.push(selection);
  return platform === "mac" ? keys.join(" ") : keys.join("+");
}

function shortcutHotkeys(selection, modifiers) {
  let prefixes = [""];
  if (modifiers.shift) {
    prefixes = prefixes.map((prefix) => `Shift+${prefix}`);
  }
  if (modifiers.option) {
    prefixes = prefixes.flatMap((prefix) => [`Option+${prefix}`, `Alt+${prefix}`]);
  }
  if (modifiers.meta) {
    prefixes = prefixes.flatMap((prefix) => [`Cmd+${prefix}`, `Ctrl+${prefix}`]);
  } else if (modifiers.ctrl) {
    prefixes = prefixes.map((prefix) => `Ctrl+${prefix}`);
  }

  const keyStrings =
    {
      "⏎": ["Enter"],
      "⌫": ["Backspace", "Delete"],
      "↑": ["Up"],
      "↓": ["Down"],
      "←": ["Left"],
      "→": ["Right"],
    }[selection] ?? [selection];

  return prefixes.flatMap((prefix) => keyStrings.map((keyString) => `${prefix}${keyString}`)).join(", ");
}

export function extractShortcuts(source) {
  const objectLiteral = extractAssignedBlock(source, "KEYBOARD_SHORTCUTS", "{", "}");
  const shortcuts = [];
  const regex = /^\s*([A-Za-z0-9_]+):\s*getKeyboardShortcut\('([^']+)'(?:,\s*\{([^}]*)\})?\),/gm;
  for (const match of objectLiteral.matchAll(regex)) {
    const modifiers = parseShortcutModifiers(match[3] ?? "");
    shortcuts.push({
      key: match[1],
      mac: shortcutKeysForPlatform(match[2], modifiers, "mac"),
      windows: shortcutKeysForPlatform(match[2], modifiers, "windows"),
      hotkeys: shortcutHotkeys(match[2], modifiers),
    });
  }

  return shortcuts;
}

async function renderShortcuts(runwayRepo) {
  const source = await readProductFile(runwayRepo, "webapp/src/config/shortcuts.tsx");
  const shortcuts = extractShortcuts(source);
  if (shortcuts.length < 50) {
    throw new Error(`Expected at least 50 shortcuts, found ${shortcuts.length}.`);
  }
  const documentedShortcuts = shortcuts.filter((shortcut) => !OMITTED_SHORTCUT_KEYS.has(shortcut.key));
  const missingMetadata = documentedShortcuts.filter((shortcut) => SHORTCUT_METADATA[shortcut.key] == null);
  if (missingMetadata.length > 0) {
    throw new Error(`Missing shortcut metadata for: ${missingMetadata.map((s) => s.key).join(", ")}`);
  }

  return [
    "The tables below use the shortcut registry from the Runway webapp. `Cmd+Shift+S` has two contexts: it strikes selected text in text editing surfaces and reveals the current page in the sidebar in grid and page contexts.",
    "",
    "<Tabs>",
    '  <Tab title="Mac">',
    indentBlock(renderShortcutPlatform(documentedShortcuts, "mac"), 4),
    "  </Tab>",
    '  <Tab title="Windows">',
    indentBlock(renderShortcutPlatform(documentedShortcuts, "windows"), 4),
    "  </Tab>",
    "</Tabs>",
    "",
  ].join("\n");
}

function renderShortcutPlatform(shortcuts, platform) {
  const grouped = new Map(SHORTCUT_CATEGORY_ORDER.map((category) => [category, []]));
  for (const shortcut of shortcuts) {
    const [category, action] = SHORTCUT_METADATA[shortcut.key];
    grouped.get(category).push([action, `\`${shortcut[platform]}\``, `\`${shortcut.hotkeys}\``]);
  }

  const output = [];
  for (const category of SHORTCUT_CATEGORY_ORDER) {
    const rows = grouped.get(category);
    if (rows.length === 0) {
      continue;
    }
    output.push(`### ${category}`);
    output.push("");
    output.push(markdownTable(["Action", "Shortcut", "Registered hotkeys"], rows));
    output.push("");
  }
  return stripTrailingNewline(output.join("\n"));
}

function indentBlock(value, spaces) {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line.length === 0 ? line : `${prefix}${line}`))
    .join("\n");
}

function extractRoleConfig(source) {
  const displayBlock = extractAssignedBlock(source, "ORG_ROLE_TO_DISPLAY", "{", "}");
  const descriptionBlock = extractAssignedBlock(source, "ORG_ROLE_TO_DESCRIPTION", "{", "}");
  const displays = new Map();
  const descriptions = new Map();
  const entryRegex = /\[OrgRole\.([A-Za-z]+)\]:\s*'([^']+)'/g;
  for (const match of displayBlock.matchAll(entryRegex)) {
    displays.set(match[1], match[2]);
  }
  for (const match of descriptionBlock.matchAll(entryRegex)) {
    descriptions.set(match[1], match[2]);
  }
  if (!displays.has("Owner") || !displays.has("Anonymous") || !displays.has("ModelAdmin")) {
    throw new Error("Role display map is missing expected roles.");
  }
  return { displays, descriptions };
}

function extractDefaultAcls(source) {
  const functionIndex = source.indexOf("func DefaultACLs()");
  if (functionIndex === -1) {
    throw new Error("Could not find DefaultACLs.");
  }
  const sliceIndex = source.indexOf("[]DefaultACLConfig{", functionIndex);
  const openIndex = source.indexOf("{", sliceIndex);
  const slice = readBalancedBlock(source, openIndex, "{", "}");
  const acls = [];
  for (const block of splitTopLevelObjects(`[${slice.slice(1, -1)}]`)) {
    const role = requireMatch(block, /Role:\s*database\.OrgRole([A-Za-z]+)/, "ACL role")[1];
    const resourceType = requireMatch(
      block,
      /ResourceType:\s*modelv2\.AccessResourceType([A-Za-z]+)/,
      `ACL resource for ${role}`,
    )[1];
    const permission = requireMatch(
      block,
      /Permission:\s*modelv2\.AccessRule([A-Za-z]+)/,
      `ACL permission for ${role}`,
    )[1];
    const allow = requireMatch(block, /Allow:\s*(true|false)/, `ACL allow for ${role}`)[1] === "true";
    const resourceID = /ResourceID:\s*lo\.ToPtr\(layers\.DefaultLayerID\)/.test(block)
      ? "default layer"
      : "";
    acls.push({ role, resourceType, permission, allow, resourceID });
  }
  if (acls.length < 20) {
    throw new Error(`Expected at least 20 default ACLs, found ${acls.length}.`);
  }
  return acls;
}

async function renderRoles(runwayRepo) {
  const roleSource = await readProductFile(runwayRepo, "webapp/src/config/userRoles.ts");
  const aclSource = await readProductFile(runwayRepo, "go/api-server/app/permissions/constants.go");
  const roles = extractRoleConfig(roleSource);
  const acls = extractDefaultAcls(aclSource);

  const output = [];
  output.push("## Organization roles");
  output.push("");
  output.push(
    "Runway roles are strictly hierarchical: Owner > Admin > Manager > Member > Guest > Anonymous user. A user's role caps what per-resource access can grant.",
  );
  output.push("");
  output.push(renderRoleTable(roles));
  output.push("");
  output.push("## Default capability matrix");
  output.push("");
  output.push(
    "This matrix shows the default system ACLs seeded for each role. A check means the default ACL grants that capability; a dash means it is not granted by the default ACL or is explicitly denied.",
  );
  output.push("");
  output.push(renderAclMatrix(acls));
  output.push("");
  output.push("Guest and Anonymous user have no default ACLs; they only receive access that is explicitly shared.");
  output.push("");
  output.push("## Resource access levels");
  output.push("");
  output.push(renderAccessLevelTable());
  output.push("");
  output.push(
    "Role and resource access combine by taking the narrower result: the role sets the user's maximum workspace capability, and the resource access level controls what they can do on a specific page, section, block, scenario, or database column.",
  );
  output.push("");
  output.push("## What's next");
  output.push("");
  output.push("- [Manage permissions](/guides/sharing/permissions)");
  output.push("- [Create share links](/guides/sharing/share-links)");
  output.push("- [Manage groups](/guides/sharing/groups)");
  output.push("");
  return output.join("\n");
}

function renderRoleTable({ displays, descriptions }) {
  const rows = ROLE_ORDER.map((role) => {
    const key = role === "Anonymous user" ? "Anonymous" : role;
    return [role, descriptions.get(key) ?? "No product description encoded."];
  });
  if ([...rows.flat()].some((value) => value.includes("Model Admin"))) {
    throw new Error("Model Admin must not be documented.");
  }
  return markdownTable(["Role", "Product description"], rows);
}

function renderAclMatrix(acls) {
  const rowKeys = [];
  const grants = new Map();
  for (const acl of acls) {
    const role = acl.role;
    if (role === "ModelAdmin") {
      continue;
    }
    const resource = RESOURCE_LABELS[acl.resourceType] ?? acl.resourceType;
    const permission = ACCESS_RULE_LABELS[acl.permission] ?? acl.permission;
    const resourceLabel = acl.resourceID ? `${resource} (${acl.resourceID})` : resource;
    const rowKey = `${resourceLabel} - ${permission}`;
    if (!rowKeys.includes(rowKey)) {
      rowKeys.push(rowKey);
    }
    grants.set(`${rowKey}:${role}`, acl.allow);
  }

  const rows = rowKeys.map((rowKey) => [
    rowKey,
    ...ROLE_ORDER.map((role) => {
      const normalizedRole = role === "Anonymous user" ? "Anonymous" : role;
      return grants.get(`${rowKey}:${normalizedRole}`) === true ? "✓" : "—";
    }),
  ]);
  return markdownTable(["Capability", ...ROLE_ORDER], rows);
}

function renderAccessLevelTable() {
  return markdownTable(["Resource type", "Access level", "Description"], ACCESS_LEVEL_ROWS);
}

function parseGeneratedCatalog(source, route) {
  const integrations = [];
  const regex =
    /NewIntegration\(\s*openapi_models\.INTEGRATIONPROVIDER_[A-Z]+,\s*"([^"]+)",\s*openapi_models\.INTEGRATIONCATEGORY_([A-Z]+),\s*"([^"]+)"/g;
  for (const match of source.matchAll(regex)) {
    integrations.push({
      slug: match[1],
      categoryKey: match[2].toLowerCase(),
      name: match[3],
      route,
      sourceKey: `${route.toUpperCase()}_${match[1].replace(/[-]/g, "_").toUpperCase()}`,
    });
  }
  if (integrations.length === 0) {
    throw new Error(`No ${route} integrations found in generated catalog.`);
  }
  return integrations;
}

export function parseRunwayNativeCatalog(source) {
  const hasFileUpload = normalizedIncludes(source, 'fileUploadSlug        = "file-upload"');
  const hasXero = normalizedIncludes(source, "xeroIntegration =");
  if (!hasFileUpload || !hasXero) {
    throw new Error("Runway native provider catalog shape changed.");
  }
  return [
    {
      slug: "file-upload",
      categoryKey: "filestorage",
      name: "CSV / Raw File Upload",
      route: "native",
      sourceKey: "FILE_UPLOAD",
    },
    {
      slug: "xero",
      categoryKey: "accounting",
      name: "Xero",
      route: "native",
      sourceKey: "RUNWAY_XERO",
    },
  ];
}

function parseRipplingCatalog(source) {
  const slug = requireMatch(source, /ripplingSlug\s*=\s*"([^"]+)"/, "Rippling slug")[1];
  const name = requireMatch(source, /ripplingDisplayName\s*=\s*"([^"]+)"/, "Rippling display name")[1];
  return [{ slug, categoryKey: "hris", name, route: "native", sourceKey: "RIPPLING" }];
}

function resolveGoString(source, value) {
  if (value.startsWith('"')) {
    return value.slice(1, -1);
  }
  return requireMatch(source, new RegExp(`const\\s+${escapeRegExp(value)}\\s*=\\s*"([^"]+)"`), value)[1];
}

const MODEL_V2_CATEGORY_KEYS = {
  Accounting: "accounting",
  HRIS: "hris",
  FileStorage: "filestorage",
};

export function parseProviderHandlerIntegration(source, { sourceKey }) {
  const block = extractAssignedBlock(source, "integration", "{", "}");
  const nameValue = requireMatch(block, /Name:\s*("[^"]+"|[A-Za-z0-9_]+)/, "provider handler integration name")[1];
  const slugValue = requireMatch(block, /Slug:\s*("[^"]+"|[A-Za-z0-9_]+)/, "provider handler integration slug")[1];
  const categoryName = requireMatch(
    block,
    /modelv2\.IntegrationCategory([A-Za-z0-9]+)/,
    "provider handler integration category",
  )[1];
  const categoryKey = MODEL_V2_CATEGORY_KEYS[categoryName];
  if (!categoryKey) {
    throw new Error(`Unsupported provider handler integration category: ${categoryName}.`);
  }
  return {
    slug: resolveGoString(source, slugValue),
    categoryKey,
    name: resolveGoString(source, nameValue),
    route: "native",
    sourceKey,
  };
}

function parseWorkatoSources(source) {
  const objectLiteral = extractAssignedBlock(source, "EXT_DRIVER_SOURCE_TO_SLUG", "{", "}");
  const integrations = [];
  const regex = /\[ExtStaticSource\.Workato([A-Za-z0-9_]+)\]:\s*'([^']+)'/g;
  for (const match of objectLiteral.matchAll(regex)) {
    const slug = match[2];
    integrations.push({
      slug,
      categoryKey: "uncategorized",
      name: WORKATO_DISPLAY[slug] ?? humanizeSlug(slug),
      route: "Workato",
      sourceKey: `WORKATO_${camelToScreamingSnake(match[1])}`,
    });
  }
  if (integrations.length < 20) {
    throw new Error(`Expected at least 20 Workato sources, found ${integrations.length}.`);
  }
  return integrations;
}

function humanizeSlug(slug) {
  return slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function camelToScreamingSnake(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/__+/g, "_")
    .toUpperCase();
}

function integrationDocsCategory(integration) {
  if (integration.categoryKey === "hris") {
    return "HRIS";
  }
  return INTEGRATION_CATEGORY_OVERRIDES[integration.slug] ?? "Other";
}

function integrationNotes(integration) {
  const notes = [];
  if (MULTI_ACCOUNT_SLUGS.has(integration.slug)) {
    notes.push("Multi-account support");
  }
  if (integration.route === "Fivetran") {
    notes.push("SQL-queryable");
  }
  if (integration.route === "Workato" && SQL_SOURCE_KEYS.has(integration.sourceKey)) {
    notes.push("SQL-queryable");
  }
  if (integration.route === "Merge" && MERGE_PASSTHROUGH_SQL_SLUGS.has(integration.slug)) {
    notes.push("Merge passthrough SQL when enabled");
  }
  if (integration.slug === "file-upload") {
    notes.push("Bring CSV or raw files into Runway");
  }
  if (integration.slug === "xero" && integration.route === "native") {
    notes.push("Unified Xero connection route");
  }
  return notes.join("; ");
}

async function renderIntegrations(runwayRepo) {
  const [
    mergeGenerated,
    fivetranGenerated,
    runwayProvider,
    ripplingProvider,
    puzzleHandler,
    runwayApiHandler,
    helpersSource,
  ] = await Promise.all([
    readProductFile(runwayRepo, "go/apisvc/integrations/providers/merge/catalog/catalog_gen.go"),
    readProductFile(runwayRepo, "go/apisvc/integrations/providers/fivetran/catalog/catalog_gen.go"),
    readProductFile(runwayRepo, "go/apisvc/integrations/providers/runway/provider.go"),
    readProductFile(runwayRepo, "go/apisvc/integrations/providers/rippling/provider.go"),
    readProductFile(runwayRepo, "go/api-server/app/handlers/integrations/internal/providers/puzzle/puzzle.go"),
    readProductFile(runwayRepo, "go/api-server/app/handlers/integrations/internal/providers/runway_api/runway_api.go"),
    readProductFile(runwayRepo, "webapp/src/helpers/integrations.ts"),
  ]);

  const integrations = [
    ...parseGeneratedCatalog(mergeGenerated, "Merge"),
    ...parseGeneratedCatalog(fivetranGenerated, "Fivetran"),
    ...parseRunwayNativeCatalog(runwayProvider),
    ...parseRipplingCatalog(ripplingProvider),
    parseProviderHandlerIntegration(puzzleHandler, { sourceKey: "PUZZLE_ACCOUNTING" }),
    parseProviderHandlerIntegration(runwayApiHandler, { sourceKey: "RUNWAY_API" }),
    ...parseWorkatoSources(helpersSource),
  ];

  const mergeHris = integrations.filter((integration) => integration.route === "Merge" && integration.categoryKey === "hris");
  if (mergeHris.length === 0) {
    throw new Error("No Merge HRIS integrations found in generated catalog.");
  }

  const output = [];
  for (const category of INTEGRATION_CATEGORY_ORDER) {
    const rows = integrations
      .filter((integration) => integrationDocsCategory(integration) === category)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((integration) => [
        integration.name,
        integration.route,
        integrationNotes(integration),
      ]);
    output.push(`## ${category}`);
    output.push("");
    output.push(markdownTable(["Integration", "Connection route", "Notes"], rows));
    output.push("");
  }
  output.push(
    "If your source is not listed here, bring the data into Runway through your warehouse, Google Sheets, CSV or raw file upload, or your own Fivetran account. Runway does not expose the full Fivetran connector universe as a supported catalog.",
  );
  output.push("");
  output.push(
    "Catalog note: the webapp multi-account configuration still includes Zenefits, but Zenefits is not in the current Merge offered catalog.",
  );
  output.push("");
  return output.join("\n");
}

async function readProductFile(runwayRepo, relativePath) {
  if (!runwayRepo) {
    throw new Error("--runway-repo is required.");
  }
  const fullPath = join(runwayRepo, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Missing product source file: ${fullPath}`);
  }
  return readFile(fullPath, "utf8");
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    return { help: true };
  }
  const args = { command, check: false, runwayRepo: "" };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--check") {
      args.check = true;
    } else if (value === "--runway-repo") {
      args.runwayRepo = rest[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/generate-references.mjs <functions|shortcuts|roles|integrations> --runway-repo <path> [--check]",
    "",
    "Regenerates the GENERATED marker block for one reference page. --check exits non-zero on drift without writing.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const target = GENERATED_TARGETS[args.command];
  if (!target) {
    throw new Error(`Unknown subcommand: ${args.command}`);
  }
  const pagePath = join(REPO_ROOT, target.pagePath);
  const generatedContent = await target.render(args.runwayRepo);

  if (args.check) {
    const result = await checkGeneratedBlock(pagePath, target.marker, generatedContent);
    if (!result.ok) {
      console.error(result.message);
      process.exitCode = 1;
      return;
    }
    console.log(result.message);
    return;
  }

  const changed = await updateGeneratedBlock(pagePath, target.marker, generatedContent);
  console.log(`${target.pagePath} ${changed ? "updated" : "already up to date"}.`);
}

if (process.argv[1] === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
