#!/usr/bin/env node
/**
 * Simple Chart Calculator — Human Design MCP Server
 * ------------------------------------------------------------------
 * Exposes the SCC Human Design API as MCP tools so Claude, Cursor,
 * Cline, or any MCP client can compute charts natively.
 *
 * Auth: set SCC_API_KEY in the MCP server env (works with any tier,
 * including the free key). Get one at https://simplechartcalculator.com/register
 * ------------------------------------------------------------------
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const API_BASE = process.env.SCC_API_BASE || "https://api.simplechartcalculator.com";
const API_KEY = process.env.SCC_API_KEY || "";

if (!API_KEY) {
  process.stderr.write(
    "[simplechart-mcp] Missing SCC_API_KEY. Get a free key at " +
      "https://simplechartcalculator.com/register and set it in your MCP env.\n"
  );
}

/** GET the API with the key injected; returns parsed JSON or throws a clean error. */
async function callApi(path, params) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  url.searchParams.set("key", API_KEY);

  const res = await fetch(url, {
    headers: {
      Origin: "https://simplechartcalculator.com",
      "X-ASCCalc-Client": "mcp", // lets the backend meter MCP calls against the per-tier MCP cap
    },
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text).detail ?? text;
    } catch {
      /* keep raw text */
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return text; // already JSON string — hand straight to the model
}

function ok(text) {
  return { content: [{ type: "text", text }] };
}
function fail(err) {
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
  };
}

// ── People roster — local JSON persistence (your data stays on your machine) ──
const ROSTER_DIR = path.join(os.homedir(), ".simplechart-mcp");
const ROSTER_FILE = path.join(ROSTER_DIR, "people.json");

function loadRoster() {
  try {
    return JSON.parse(fs.readFileSync(ROSTER_FILE, "utf8"));
  } catch {
    return {};
  }
}
function saveRoster(roster) {
  fs.mkdirSync(ROSTER_DIR, { recursive: true });
  fs.writeFileSync(ROSTER_FILE, JSON.stringify(roster, null, 2), "utf8");
}
function personParams(p) {
  return { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute, s: p.second ?? 0, tz: p.timezone };
}

// ── Connection analysis (compare_charts) ──
// 36 canonical Human Design channels.
const CHANNELS = [
  [64, 47], [61, 24], [63, 4], [17, 62], [43, 23], [11, 56], [16, 48], [20, 57],
  [20, 10], [20, 34], [31, 7], [8, 1], [33, 13], [45, 21], [35, 36], [12, 22],
  [10, 57], [10, 34], [15, 5], [2, 14], [46, 29], [25, 51], [18, 58], [28, 38],
  [32, 54], [50, 27], [34, 57], [44, 26], [59, 6], [9, 52], [3, 60], [42, 53],
  [37, 40], [19, 49], [39, 55], [41, 30],
];

// Deep-scan an API chart response for every active gate number (robust to shape).
function collectGates(obj, acc = new Set()) {
  if (obj == null || typeof obj !== "object") return acc;
  for (const [k, v] of Object.entries(obj)) {
    if ((k === "Gate" || k === "gate") && typeof v === "number") acc.add(v);
    else if (typeof v === "object") collectGates(v, acc);
  }
  return acc;
}

// Classify each channel formed when combining two people's gates.
function analyzeConnection(gatesA, gatesB) {
  const out = { electromagnetic: [], dominanceA: [], dominanceB: [], compromise: [], companionship: [] };
  for (const [g1, g2] of CHANNELS) {
    const a1 = gatesA.has(g1), a2 = gatesA.has(g2);
    const b1 = gatesB.has(g1), b2 = gatesB.has(g2);
    const combined1 = a1 || b1, combined2 = a2 || b2;
    if (!(combined1 && combined2)) continue; // channel doesn't form
    const aFull = a1 && a2, bFull = b1 && b2;
    const label = `${g1}-${g2}`;
    if (aFull && bFull) out.companionship.push(label);
    else if (aFull && (b1 || b2)) out.compromise.push(label);
    else if (bFull && (a1 || a2)) out.compromise.push(label);
    else if (aFull) out.dominanceA.push(label);
    else if (bFull) out.dominanceB.push(label);
    else out.electromagnetic.push(label); // each contributes one gate
  }
  return out;
}

const server = new McpServer({
  name: "human-design",
  version: "1.0.0",
});

// ── calculate_chart ────────────────────────────────────────────────
server.tool(
  "calculate_chart",
  "Calculate a complete Human Design bodygraph chart from birth data. " +
    "Returns type, authority, profile, incarnation cross, defined/open centers, " +
    "channels, and every planet as gate.line.color.tone.base for both Personality and Design.",
  {
    year: z.number().int().describe("Birth year, e.g. 1948"),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    second: z.number().int().min(0).max(59).optional().describe("Optional, default 0"),
    timezone: z.string().describe("IANA timezone of the birth place, e.g. 'America/Toronto'"),
  },
  async ({ year, month, day, hour, minute, second, timezone }) => {
    try {
      const data = await callApi("/v1/calculate", {
        y: year, m: month, d: day, h: hour, min: minute, s: second ?? 0, tz: timezone,
      });
      return ok(data);
    } catch (e) {
      return fail(e);
    }
  }
);

// ── calculate_cycle ────────────────────────────────────────────────
server.tool(
  "calculate_cycle",
  "Find the exact moment of a Human Design cycle return (Solar Return, Saturn Return, " +
    "Uranus Opposition, or Chiron Return) with sub-second precision, and return the full " +
    "chart for that moment. Uses a binary search on continuous time.",
  {
    cycle: z
      .enum(["solar-return", "saturn-return-1", "saturn-return-2", "uranus-opposition", "chiron-return"])
      .describe("Which cycle to compute"),
    natal_year: z.number().int(),
    natal_month: z.number().int().min(1).max(12),
    natal_day: z.number().int().min(1).max(31),
    natal_hour: z.number().int().min(0).max(23),
    natal_minute: z.number().int().min(0).max(59),
    natal_second: z.number().int().min(0).max(59).optional(),
    natal_timezone: z.string().describe("IANA timezone of the birth place"),
    return_year: z
      .number()
      .int()
      .optional()
      .describe("Required for solar-return — which birthday (e.g. 36 = 36th)"),
    result_timezone: z
      .string()
      .optional()
      .describe("Timezone for the returned datetime (defaults to natal_timezone)"),
  },
  async (a) => {
    try {
      const data = await callApi("/v1/cycle", {
        cycle: a.cycle,
        natal_y: a.natal_year, natal_m: a.natal_month, natal_d: a.natal_day,
        natal_h: a.natal_hour, natal_min: a.natal_minute, natal_s: a.natal_second ?? 0,
        natal_tz: a.natal_timezone,
        return_year: a.return_year,
        result_tz: a.result_timezone,
      });
      return ok(data);
    } catch (e) {
      return fail(e);
    }
  }
);

// ── get_transit ────────────────────────────────────────────────────
server.tool(
  "get_transit",
  "Get the current global Human Design transit chart — the live planetary weather right now.",
  {},
  async () => {
    try {
      const data = await callApi("/v1/transit", {});
      return ok(data);
    } catch (e) {
      return fail(e);
    }
  }
);

// ── get_synthesis ──────────────────────────────────────────────────
// Convenience alias: same endpoint as calculate_chart, framed as "interpret".
server.tool(
  "get_synthesis",
  "Return the interpretive synthesis for a birth chart — type, strategy, authority, " +
    "signature, not-self theme, profile, definition, incarnation cross and variables. " +
    "(Same engine as calculate_chart; use this when you want the meaning, not raw planets.)",
  {
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    second: z.number().int().min(0).max(59).optional(),
    timezone: z.string(),
  },
  async ({ year, month, day, hour, minute, second, timezone }) => {
    try {
      const data = await callApi("/v1/calculate", {
        y: year, m: month, d: day, h: hour, min: minute, s: second ?? 0, tz: timezone,
      });
      return ok(data);
    } catch (e) {
      return fail(e);
    }
  }
);

// ── save_person ────────────────────────────────────────────────────
const personShape = {
  name: z.string().describe("A label to save this person under, e.g. 'Mum' or 'Ra'"),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  second: z.number().int().min(0).max(59).optional(),
  timezone: z.string().describe("IANA timezone of the birth place"),
};

server.tool(
  "save_person",
  "Save a person's birth data locally (on this machine) so their chart can be recalled or compared by name later.",
  personShape,
  async (a) => {
    try {
      const roster = loadRoster();
      roster[a.name] = {
        year: a.year, month: a.month, day: a.day,
        hour: a.hour, minute: a.minute, second: a.second ?? 0, timezone: a.timezone,
      };
      saveRoster(roster);
      return ok(`Saved "${a.name}". Roster now has ${Object.keys(roster).length} people.`);
    } catch (e) {
      return fail(e);
    }
  }
);

// ── list_people ────────────────────────────────────────────────────
server.tool(
  "list_people",
  "List everyone saved in the local roster with their birth data.",
  {},
  async () => {
    try {
      const roster = loadRoster();
      const names = Object.keys(roster);
      if (!names.length) return ok("Roster is empty. Use save_person to add someone.");
      return ok(JSON.stringify(roster, null, 2));
    } catch (e) {
      return fail(e);
    }
  }
);

// ── get_person ─────────────────────────────────────────────────────
server.tool(
  "get_person",
  "Recall a saved person and return their full Human Design chart by name.",
  { name: z.string().describe("The saved person's name") },
  async ({ name }) => {
    try {
      const roster = loadRoster();
      const p = roster[name];
      if (!p) return fail(new Error(`No saved person named "${name}". Use list_people to see the roster.`));
      const data = await callApi("/v1/calculate", personParams(p));
      return ok(data);
    } catch (e) {
      return fail(e);
    }
  }
);

// ── remove_person ──────────────────────────────────────────────────
server.tool(
  "remove_person",
  "Delete a person from the local roster.",
  { name: z.string() },
  async ({ name }) => {
    try {
      const roster = loadRoster();
      if (!(name in roster)) return fail(new Error(`No saved person named "${name}".`));
      delete roster[name];
      saveRoster(roster);
      return ok(`Removed "${name}". Roster now has ${Object.keys(roster).length} people.`);
    } catch (e) {
      return fail(e);
    }
  }
);

// ── compare_charts ─────────────────────────────────────────────────
server.tool(
  "compare_charts",
  "Compare two Human Design charts and return their connection dynamics — electromagnetic, " +
    "dominance, compromise and companionship channels. Give two saved names, two sets of birth " +
    "data, or a mix.",
  {
    a_name: z.string().optional().describe("Saved name for person A (instead of birth data)"),
    b_name: z.string().optional().describe("Saved name for person B (instead of birth data)"),
    a: z.object({
      year: z.number().int(), month: z.number().int(), day: z.number().int(),
      hour: z.number().int(), minute: z.number().int(), second: z.number().int().optional(),
      timezone: z.string(),
    }).optional().describe("Birth data for person A (if not using a_name)"),
    b: z.object({
      year: z.number().int(), month: z.number().int(), day: z.number().int(),
      hour: z.number().int(), minute: z.number().int(), second: z.number().int().optional(),
      timezone: z.string(),
    }).optional().describe("Birth data for person B (if not using b_name)"),
  },
  async (args) => {
    try {
      const roster = loadRoster();
      const resolve = (name, data, which) => {
        if (name) {
          const p = roster[name];
          if (!p) throw new Error(`No saved person named "${name}".`);
          return { label: name, params: personParams(p) };
        }
        if (data) return { label: which, params: personParams(data) };
        throw new Error(`Provide ${which}_name or ${which} birth data.`);
      };
      const A = resolve(args.a_name, args.a, "a");
      const B = resolve(args.b_name, args.b, "b");

      const [rawA, rawB] = await Promise.all([
        callApi("/v1/calculate", A.params),
        callApi("/v1/calculate", B.params),
      ]);
      const gatesA = collectGates(JSON.parse(rawA));
      const gatesB = collectGates(JSON.parse(rawB));
      const conn = analyzeConnection(gatesA, gatesB);

      const summary = {
        personA: A.label,
        personB: B.label,
        connection: conn,
        counts: {
          electromagnetic: conn.electromagnetic.length,
          dominanceA: conn.dominanceA.length,
          dominanceB: conn.dominanceB.length,
          compromise: conn.compromise.length,
          companionship: conn.companionship.length,
        },
        legend: {
          electromagnetic: "Each contributes one gate — attraction / mutual completion.",
          dominance: "One person already has the full channel; they lead its theme.",
          compromise: "One has the full channel, the other has one gate — needs adjustment.",
          companionship: "Both have the full channel — shared, self-sufficient.",
        },
      };
      return ok(JSON.stringify(summary, null, 2));
    } catch (e) {
      return fail(e);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[simplechart-mcp] Human Design MCP server running on stdio (9 tools).\n");
