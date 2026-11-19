# OpenWeb Ninja MCP Server

Official [Model Context Protocol](https://modelcontextprotocol.io) server for [OpenWeb Ninja](https://www.openwebninja.com) APIs. Gives any MCP-compatible AI agent (Claude, Cursor, Cline, and others) real-time access to web search, local business data, jobs, e-commerce, real estate, finance, news, and more, through a single connection.

One tool per API product (52 tools), each exposing that API's operations, plus a `subscribe` tool for adding an API's free tier on demand — 53 tools in total. Schemas are generated directly from OpenWeb Ninja's OpenAPI specs, so the server always matches the live APIs.

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

### Docker (remote HTTP server)

The image runs the server over [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) instead of stdio, so clients can connect over the network:

```bash
docker build -t openwebninja-mcp .
docker run -d --name openwebninja-mcp --restart unless-stopped \
  -e OPENWEBNINJA_API_KEY=your-api-key \
  -e MCP_AUTH_TOKEN=a-long-random-secret \
  -p 3000:3000 openwebninja-mcp
```

- MCP endpoint: `http://<host>:3000/mcp`; health check: `http://<host>:3000/healthz`.
- Set `MCP_AUTH_TOKEN`. Without it, anyone who can reach the port can spend your API key. Clients then send `Authorization: Bearer <token>`.
- Put it behind a TLS-terminating reverse proxy (nginx, Caddy, Traefik) when exposing it beyond a private network.
- The server is stateless, so you can run several replicas behind a load balancer.

Connect from Claude Code:

```bash
claude mcp add --transport http openwebninja http://<host>:3000/mcp --header "Authorization: Bearer a-long-random-secret"
```

To try it locally on Windows, `./run-local.ps1` builds the image and runs it with the variables from `.env` on `http://localhost:3000/mcp`.

Outside Docker, the same mode is `MCP_TRANSPORT=http node dist/index.js` (or `node dist/index.js --http`).

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
| `MCP_TRANSPORT` | no | `stdio` (default) or `http`. The Docker image sets `http`. |
| `PORT` / `HOST` | no | HTTP mode listen port and address (default `3000` / `0.0.0.0`). |
| `MCP_AUTH_TOKEN` | no (recommended for HTTP) | If set, HTTP requests to `/mcp` must send `Authorization: Bearer <token>`. |

## Available tools (54)

**Search & discovery:** `realtime_web_search`, `realtime_bing_search_data`, `realtime_news_data`, `real_time_news_search`, `realtime_forums_search`, `web_search_autocomplete`, `realtime_image_search`, `reverse_image_search`, `realtime_lens_data`, `real_time_video_search`, `realtime_shorts_search`, `ai_overviews`, `google_ai_mode`, `social_links_search`

**Local & maps:** `local_business_data`, `local_business_database`, `yelp_business_data`, `trustpilot_company_and_reviews`, `local_rank_tracker`, `driving_directions`, `waze`, `google_maps_traffic_alerts`, `ev_charge_finder`

**Jobs & companies:** `jsearch`, `realtime_linkedin_data`, `realtime_indeed_data`, `realtime_ziprecruiter_data`, `realtime_monster_data`, `job_salary_data`, `realtime_glassdoor_data`

**Commerce & product:** `realtime_amazon_data`, `realtime_product_search`, `real_time_walmart_data`, `real_time_ebay_data`, `realtime_aliexpress_data`, `realtime_costco_data`, `real_time_wayfair_data`, `realtime_homedepot_data`, `realtime_lowes_data`, `realtime_books_data`, `play_store_apps`

**Real estate:** `realtime_zillow_data`, `real_time_redfin_data`

**Finance & events:** `realtime_finance_data`, `realtime_events_data`

**Contact & enrichment:** `website_contacts_scraper`, `email_search`, `realtime_similarweb_data`

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
