# OpenWeb Ninja MCP — Capabilities & Example Prompts

One connection gives any MCP-compatible AI agent (Claude Desktop/Code, Cursor, Cline, Windsurf, and others) live access to **all 41 OpenWeb Ninja APIs as tools**. The user adds the server once with their API key, then just asks in plain English. The agent picks the right API, calls it, and answers. It can also **chain several APIs in one task** and **self-subscribe** to an API's free tier on demand.

All outputs below are from real calls against the live server.

---

## How it operates (real agent run)

> **User:** "Compare the current price of the Sony WH-1000XM5 headphones on Amazon versus eBay, and tell me which is cheaper right now."

With no further instruction, the agent chose to call **two** tools and synthesize the answer:
- `realtime_amazon_data` -> `search "Sony WH-1000XM5"`
- `real_time_ebay_data` -> `search "Sony WH-1000XM5"`

> **Agent:** "eBay is cheaper on every tier. Brand New mainstream: Amazon **$278** vs eBay **~$175** (~$100 less); lowest credible new: $191 vs $155; renewed/open-box: $200 vs $125. If you want first-party warranty + Prime, Amazon at $278 is the safe pick."

The user describes a goal; the agent orchestrates the APIs. That is the whole product.

---

## What users can do (by outcome)

**Lead generation & enrichment**
> "Find 50 dentists in Austin TX with their phone numbers and emails, then find their LinkedIn pages."
Tools: `local_business_data` (emails/phones) -> `website_contacts_scraper` -> `email_search` -> `social_links_search`.

**Competitor & market research**
> "What's the best CRM software for 2026?"
`realtime_web_search` returns live Google results: PCMag's tested picks (HubSpot, Salesforce, Zoho, Creatio, Insightly) with links and snippets.

**Price tracking & comparison**
> "What's the Sony WH-1000XM5 selling for on Amazon?"
`realtime_amazon_data`: **$278.00** (was $399.99), 4.2 stars / 19,572 ratings, 712 matches, 15 offers from $205. (Chain with eBay/Walmart/Costco for a full comparison, as above.)

**Brand & review monitoring**
> "What are people saying about our brand on Trustpilot and Reddit this week?"
`trustpilot_company_and_reviews` + `realtime_forums_search` + `realtime_news_data` + `yelp_business_data`.

**Recruiting & job-market research**
> "Find data scientist jobs in the US and the typical salary."
`jsearch` returns 10 live postings, e.g. *"AI/ML Data Scientist - MLOps"* (Jobs via Dice, Full-time, direct LinkedIn apply link). Chain with `jsearch /estimated-salary` and `realtime_glassdoor_data`.

**Real estate (with commute overlay)**
> "Show me homes for sale in 90210 and how far each is from downtown LA."
`realtime_zillow_data` returns 41 listings, e.g. *9422 Readcrest Dr, Beverly Hills* — $3,599,000, 3bd/3ba, 2,554 sqft, Zestimate $3.39M. Chain with `driving_directions` / `waze`.

**Finance & markets**
> "What's Apple trading at right now?"
`realtime_finance_data`: AAPL **$315.20**, with volume, change %, and pre/post-market. Chain with `stock_news`.

**News & trends**
> "Latest news on artificial intelligence."
`realtime_news_data`: 100 live articles, e.g. NYT *"China Aims A.I. at Predicting Who Could Pose a Political Risk"* with link + snippet.

**GEO / AI-search monitoring** (a fast-growing use case)
> "How do ChatGPT, Gemini, and Copilot answer 'best CRM for startups' — and does our brand get mentioned?"
`chatgpt` + `gemini` + `copilot` + `ai_overviews` + `google_ai_mode` let an agent query the AI engines and Google's AI surfaces directly and compare. Example, `ai_overviews "what is retrieval augmented generation"` returns Google's AI Overview text plus its cited source links, live.

---

## Example prompts -> real outputs

| A user asks… | Tool | Real result (today) |
|---|---|---|
| "Data scientist jobs in the US" | `jsearch` | 10 postings, e.g. "AI/ML Data Scientist - MLOps" (Jobs via Dice, apply link) |
| "Best CRM software 2026?" | `realtime_web_search` | Google organic: PCMag picks (HubSpot, Salesforce, Zoho…) + links |
| "Sony WH-1000XM5 price on Amazon" | `realtime_amazon_data` | $278 (was $399.99), 4.2★/19,572, 712 matches |
| "Homes for sale in 90210" | `realtime_zillow_data` | 41 listings; Beverly Hills $3.6M, 3bd/3ba, Zestimate $3.39M |
| "Latest AI news" | `realtime_news_data` | 100 articles incl. NYT front-page tech piece |
| "Apple stock price" | `realtime_finance_data` | AAPL $315.20 real-time quote |
| "Explain retrieval-augmented generation" | `ai_overviews` | Google AI Overview text + cited sources |

---

## Multi-step workflows (the agent chains tools on its own)

The user asks once; the agent runs the pipeline:

- **Domain to contacts:** `website_contacts_scraper` -> `email_search` -> `social_links_search`
- **Product + reviews dataset:** `realtime_amazon_data /product-details` -> `/product-reviews`
- **Employer intelligence:** `jsearch /search` -> `realtime_glassdoor_data /company-overview`
- **Brand monitoring:** `realtime_news_data` -> `realtime_forums_search`
- **Real estate + traffic:** `realtime_zillow_data` -> `driving_directions` / `waze`
- **AI response comparison (GEO):** same prompt to `chatgpt` + `gemini` + `copilot`, compare brand mentions
- **Image provenance:** `reverse_image_search` -> `realtime_web_search`

---

## Self-service access

If the agent reaches for an API the key isn't subscribed to, the tool returns a clear message telling it to call the **`subscribe`** tool, which grants that API's **free tier** on the spot (no charge, never alters a paid plan). The agent then retries and continues — so it can expand its own capabilities mid-task without the user touching the portal. *(Internal/experimental; pending the call on whether to keep it.)*

---

## Full catalog (41 tools)

- **Search & SERP:** realtime_web_search, web_search_autocomplete, ai_overviews, google_ai_mode, realtime_news_data, real_time_news_search, realtime_forums_search
- **Local & maps:** local_business_data, yelp_business_data, trustpilot_company_and_reviews, local_rank_tracker, driving_directions, waze, ev_charge_finder
- **Jobs & companies:** jsearch, job_salary_data, realtime_glassdoor_data
- **Commerce & product:** realtime_amazon_data, realtime_product_search, real_time_walmart_data, real_time_ebay_data, realtime_costco_data, real_time_wayfair_data, realtime_books_data, play_store_apps
- **Real estate:** realtime_zillow_data, real_time_redfin_data
- **Finance & events:** realtime_finance_data, realtime_events_data
- **Contact & enrichment:** website_contacts_scraper, email_search, social_links_search
- **Visual:** realtime_image_search, realtime_lens_data, reverse_image_search, realtime_shorts_search, realtime_video_search
- **AI engines (GEO):** chatgpt, gemini, copilot
- **Utility:** web_unblocker

*Coverage tested: 37/41 returned live data end-to-end; the rest were transient upstream blips unrelated to the MCP.*
