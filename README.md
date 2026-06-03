# OpenWeb Ninja MCP Server

Official [Model Context Protocol](https://modelcontextprotocol.io) server for [OpenWeb Ninja](https://www.openwebninja.com) APIs. Gives any MCP-compatible AI agent (Claude, Cursor, Cline, and others) real-time access to web search, local business data, jobs, e-commerce, real estate, finance, news, and more, through a single connection.

One tool per API product (41 tools), each exposing that API's operations, plus a `subscribe` tool for adding an API's free tier on demand — 42 tools in total. Schemas are generated directly from OpenWeb Ninja's OpenAPI specs, so the server always matches the live APIs.

## Setup

You need an OpenWeb Ninja API key. Get one at [openwebninja.com](https://www.openwebninja.com).

The server runs via `npx` — there's nothing to install globally. Pick your client below; `npx` fetches `@openwebninja/mcp-server` on demand.

### Claude Desktop

Add to `claude_desktop_config.json` (Settings -> Developer -> Edit Config):

```json
{
  "mcpServers": {
    "openwebninja": {
      "command": "npx",
      "args": ["-y", "@openwebninja/mcp-server"],
      "env": { "OPENWEBNINJA_API_KEY": "your-api-key" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add openwebninja -e OPENWEBNINJA_API_KEY=your-api-key -- npx -y @openwebninja/mcp-server
```

### Cursor / Cline / Continue / Windsurf

Use the same `command` / `args` / `env` shape in the client's MCP config (`mcp.json` or equivalent).

### From source (local development)

```bash
git clone <repo> && cd openwebninja-mcp
npm install
npm run build
```

Then point your MCP client at the built entry:

```json
{
  "mcpServers": {
    "openwebninja": {
      "command": "node",
      "args": ["/absolute/path/to/openwebninja-mcp/dist/index.js"],
      "env": { "OPENWEBNINJA_API_KEY": "your-api-key" }
    }
  }
}
```

## How the tools work

Each tool maps to one OpenWeb Ninja API and takes two inputs:

- `operation`: which endpoint to call (e.g. `search`, `product_details`)
- `args`: the parameters for that operation

The tool description lists every operation and its required parameters. Example call to the `jsearch` tool:

```json
{
  "operation": "search",
  "args": { "query": "site reliability engineer remote", "country": "us" }
}
```

Arguments are validated and type-coerced before the request is sent, and responses return the OpenWeb Ninja `data` payload plus a `request_id`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENWEBNINJA_API_KEY` | yes | Your OpenWeb Ninja API key (sent as `x-api-key`). |
| `OPENWEBNINJA_BASE_URL` | no | Override the API host (defaults to `https://api.openwebninja.com`). For staging/testing. |

## Available tools (42)

**Search & discovery:** `realtime_web_search`, `realtime_news_data`, `real_time_news_search`, `realtime_forums_search`, `web_search_autocomplete`, `realtime_image_search`, `reverse_image_search`, `realtime_lens_data`, `real_time_video_search`, `realtime_shorts_search`, `ai_overviews`, `google_ai_mode`, `social_links_search`

**Local & maps:** `local_business_data`, `yelp_business_data`, `trustpilot_company_and_reviews`, `local_rank_tracker`, `driving_directions`, `waze`, `ev_charge_finder`

**Jobs & companies:** `jsearch`, `job_salary_data`, `realtime_glassdoor_data`

**Commerce & product:** `realtime_amazon_data`, `realtime_product_search`, `real_time_walmart_data`, `real_time_ebay_data`, `realtime_costco_data`, `real_time_wayfair_data`, `realtime_books_data`, `play_store_apps`

**Real estate:** `realtime_zillow_data`, `real_time_redfin_data`

**Finance & events:** `realtime_finance_data`, `realtime_events_data`

**Contact & enrichment:** `website_contacts_scraper`, `email_search`

**Utility:** `web_unblocker`

**LLM relays:** `chatgpt`, `gemini`, `copilot`

**Access:** `subscribe` (add an API's free tier on demand)

## Development

```bash
npm run sync       # sync OpenAPI specs from S3 into openapi-cache/ (needs AWS creds)
npm run generate   # regenerate src/generated/manifest.ts from the specs
npm run build      # compile TypeScript to dist/
npm run dev        # run the server over stdio (tsx, no build)
npm run inspect    # launch the MCP Inspector against the server
npx tsx test/smoke.ts   # smoke test: list tools + validation + request path
```

The pipeline is: OpenAPI specs (`openapi-cache/`) -> `scripts/generate.ts` -> `src/generated/manifest.ts` -> tools registered at runtime in `src/server.ts`. To add or update an API, re-sync the specs and regenerate; no hand-written per-tool code is needed (only the curated descriptions in `src/lib/descriptions.ts`).
