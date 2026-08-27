# Human Design for Claude, Cursor & Cline

[![npm version](https://img.shields.io/npm/v/@simplechart/mcp?color=c9433b&label=npm)](https://www.npmjs.com/package/@simplechart/mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-black)](./LICENSE)
[![Human Design MCP](https://img.shields.io/badge/MCP-Human%20Design-c9433b)](https://simplechartcalculator.com/mcp)

Compute Human Design charts, cycle returns, transits, synthesis, and chart
comparison **natively inside your AI assistant** — powered by
[Simple Chart Calculator](https://simplechartcalculator.com/mcp). Sub-second
precision, sub-arcsecond accuracy. 9 tools.

---

## ⚡ Fastest: remote connector — no install at all

Works in Claude on the **web, desktop and Cowork** (and any MCP client that
supports remote servers). In Claude: **Settings → Connectors → Add custom
connector**, then paste your personal URL:

```
https://api.simplechartcalculator.com/mcp/YOUR_API_KEY
```

Get a free key (and your ready-made personal URL) at
**https://simplechartcalculator.com/portal**. The URL contains your key —
treat it like a password. The remote connector exposes the 5 calculation
tools; the local install below adds a private on-device people roster.

---

## ✅ Local install — one click (Claude Desktop)

No config files, no terminal.

1. **Download** `Human-Design-SimpleChartCalculator.mcpb`.
2. **Double-click** it (or open Claude Desktop → **Settings → Extensions → Install…** and pick the file).
3. When asked, **paste your API key** in the box. No key yet? Get a free one at
   **https://simplechartcalculator.com/register** (30 seconds, no card). Keep the
   key private — it counts against your plan.
4. Done. Just chat (see *Example prompts* below).

---

## Other clients (Cursor, Cline) — config file

If you're not on Claude Desktop, add the server to your MCP config manually:

```json
{
  "mcpServers": {
    "human-design": {
      "command": "npx",
      "args": ["-y", "@simplechart/mcp"],
      "env": { "SCC_API_KEY": "YOUR_KEY" }
    }
  }
}
```

- **Cursor:** `~/.cursor/mcp.json` (or Settings → MCP → Add Server)
- **Cline:** MCP Servers → Configure

> The `npx @simplechart/mcp` command needs the package published to npm. The
> one-click `.mcpb` above is fully self-contained and works without npm.

## Tools (9)

| Tool | What it does |
|------|--------------|
| `calculate_chart` | Full bodygraph from birth data — type, authority, profile, centers, channels, all 14 planets as gate.line.color.tone.base. |
| `get_synthesis` | The interpretive layer — strategy, signature, not-self, incarnation cross, variables. |
| `calculate_cycle` | Exact Solar / Saturn / Uranus-opposition / Chiron return moment (sub-second) + the chart for it. |
| `get_transit` | The live global transit chart right now. |
| `compare_charts` | Connection dynamics between two people — electromagnetic, dominance, compromise & companionship channels. |
| `save_person` | Save birth data **locally on your machine** (`~/.simplechart-mcp/people.json`) to recall or compare by name. |
| `get_person` | Recall a saved person's full chart by name. |
| `list_people` | List everyone in your local roster. |
| `remove_person` | Delete someone from your roster. |

> Your saved people live in a local JSON file on your own machine — nothing is
> stored on our servers.

## Example prompts

Once installed, just ask your assistant in plain language:

> "Calculate the Human Design chart for Ra Uru Hu, born 9 April 1948 at 00:05 in Montreal."

> "When was Ra Uru Hu's first Saturn return? Born 9 April 1948, 00:05, Montreal."

> "Save my mum's birth data, then compare her chart with mine."

> "What's the current Human Design transit?"

## Environment variables

| Var | Required | Default |
|-----|----------|---------|
| `SCC_API_KEY` | yes | — |
| `SCC_API_BASE` | no | `https://api.simplechartcalculator.com` |

The free tier includes 300 calls/month (6 via MCP). Pro ($33/mo) includes
25,000 calls, full synthesis data and 600 MCP calls.

## License

MIT © Simple Chart Calculator
