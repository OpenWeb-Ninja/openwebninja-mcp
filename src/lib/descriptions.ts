/**
 * Hand-written, LLM-facing descriptions for each API tool. These are the primary
 * signal an agent uses to pick the right OWN tool, so they are curated rather than
 * auto-generated. `summary` says what the API does; `whenToUse` disambiguates it
 * from similar tools. APIs without an entry fall back to the manifest title/description.
 */
export interface ApiHint {
  summary: string;
  whenToUse?: string;
}

export const descriptions: Record<string, ApiHint> = {
  // Search & discovery
  realtime_web_search: {
    summary:
      "Real-time Google web search (SERP). Organic results, knowledge panels, AI Overviews and AI Mode answers for any query.",
    whenToUse:
      "Use for general web/Google searches. For news specifically use realtime_news_data; for autocomplete suggestions use web_search_autocomplete.",
  },
  realtime_news_data: {
    summary:
      "Google News data: search news, top and topic headlines, by-section and local headlines, and full-story coverage.",
    whenToUse:
      "Use for structured Google News (headlines, topics, coverage). For a flat news search across outlets use real_time_news_search; for general web results use realtime_web_search.",
  },
  real_time_news_search: {
    summary: "Flat news article search across many outlets for a keyword query.",
    whenToUse: "Use for a simple article keyword search. For Google News structure (topics, headlines) use realtime_news_data.",
  },
  realtime_forums_search: {
    summary: "Search discussion forums and community threads (Reddit and similar) for a query.",
  },
  web_search_autocomplete: {
    summary: "Google search autocomplete / query suggestions for a partial query.",
  },
  realtime_image_search: {
    summary: "Google Images search with filters (size, color, type, license) and full image metadata.",
    whenToUse: "Use to find images by keyword. To search BY an image (find where it appears) use reverse_image_search or realtime_lens_data.",
  },
  reverse_image_search: {
    summary: "Reverse image search: give an image URL, find visually matching and related images across the web.",
  },
  realtime_lens_data: {
    summary: "Google Lens on an image URL: visual matches, exact matches, object detection and OCR text extraction.",
    whenToUse: "Use for deep visual analysis of an image (objects, text, exact product matches). For simple reverse lookup use reverse_image_search.",
  },
  real_time_video_search: {
    summary: "Search videos across YouTube, Vimeo, TikTok and the web for a query.",
    whenToUse: "Use for full-length videos. For short-form clips use realtime_shorts_search.",
  },
  realtime_shorts_search: {
    summary: "Search short-form videos (YouTube Shorts and similar) for a query.",
  },
  ai_overviews: {
    summary: "Fetch Google's AI Overview answer block for a search query.",
  },
  google_ai_mode: {
    summary: "Fetch Google's AI Mode conversational answer for a query.",
  },
  social_links_search: {
    summary: "Find social media profile links (Instagram, LinkedIn, X, Facebook, TikTok, YouTube and more) for a query, domain or brand.",
  },

  // Local & maps
  local_business_data: {
    summary:
      "Google Maps business and place data: search businesses, search by area/coordinates/nearby, plus full details, reviews, photos, posts, autocomplete and reverse geocoding. Includes contact info where available.",
    whenToUse:
      "The primary tool for local businesses and places (Google Maps source). For Yelp use yelp_business_data; for Trustpilot reviews use trustpilot_company_and_reviews.",
  },
  yelp_business_data: {
    summary: "Yelp business search, business details, and Yelp reviews.",
    whenToUse: "Use for Yelp specifically. For Google Maps businesses use local_business_data.",
  },
  trustpilot_company_and_reviews: {
    summary: "Trustpilot company search, company details, reviews, and category company listings.",
  },
  local_rank_tracker: {
    summary: "Track a business's local search ranking across a geographic grid of coordinates (local SEO rank grid).",
  },
  driving_directions: {
    summary: "Turn-by-turn driving directions and route details between origin and destination.",
  },
  waze: {
    summary: "Waze data: traffic alerts and jams, driving directions, venue lookup, and place autocomplete.",
  },
  ev_charge_finder: {
    summary: "Find EV charging stations by location name or by coordinates, with connector and availability details.",
  },

  // Jobs & companies
  jsearch: {
    summary:
      "Job search aggregated from Google for Jobs (LinkedIn, Indeed, Glassdoor and more): search jobs, job details, and estimated salaries.",
    whenToUse: "Use to find job postings. For salary data only use job_salary_data; for company reviews/ratings use realtime_glassdoor_data.",
  },
  job_salary_data: {
    summary: "Estimated salary ranges for a job title and location, and company-specific job salaries.",
  },
  realtime_glassdoor_data: {
    summary: "Glassdoor company data: company search, overview, reviews, salaries, interviews and jobs.",
  },

  // Commerce & product
  realtime_amazon_data: {
    summary:
      "Amazon product data: search, products by category, product details/offers/reviews, best sellers, deals, seller and influencer data, ASIN-to-GTIN and more.",
    whenToUse: "Use for Amazon specifically. For multi-retailer Google Shopping use realtime_product_search; for Walmart/Costco/Wayfair/eBay use their dedicated tools.",
  },
  realtime_product_search: {
    summary:
      "Google Shopping product search across retailers: search, product details, offers (price comparison), reviews and price history.",
    whenToUse: "Use for cross-retailer product/price comparison. For a single retailer use realtime_amazon_data, real_time_walmart_data, etc.",
  },
  real_time_walmart_data: {
    summary: "Walmart product search, products by category, product details, offers and reviews.",
  },
  real_time_ebay_data: {
    summary: "eBay product search, products by category, product details and seller feedback across eBay domains.",
  },
  realtime_costco_data: {
    summary: "Costco product search and product details.",
  },
  real_time_wayfair_data: {
    summary: "Wayfair product search, product details and reviews (furniture and home goods).",
  },
  realtime_books_data: {
    summary: "Book search with metadata across major book sources.",
  },
  play_store_apps: {
    summary: "Google Play Store data: app search, app details, reviews, categories, developer apps and more.",
  },

  // Real estate
  realtime_zillow_data: {
    summary:
      "Zillow real estate data: search listings by location/coordinates/polygon, property details, and market trends.",
    whenToUse: "Use for Zillow. For Redfin listings use real_time_redfin_data.",
  },
  real_time_redfin_data: {
    summary: "Redfin real estate data: search listings by location/coordinates/polygon, property details and market trends.",
  },

  // Finance & events
  realtime_finance_data: {
    summary:
      "Real-time finance data: stock quotes/overviews, market trends, time series, company financials (income, balance sheet, cash flow), currency exchange and crypto.",
  },
  realtime_events_data: {
    summary: "Search local and online events, with full event details (concerts, conferences, festivals and more).",
  },

  // Contact & enrichment
  website_contacts_scraper: {
    summary: "Extract emails, phone numbers and social links from a website/domain; also find a website URL by keyword.",
    whenToUse: "Use to scrape contacts from a specific domain. To search the web for emails by person/company use email_search.",
  },
  email_search: {
    summary: "Find email addresses for a query within a given email domain (up to 5,000 results).",
    whenToUse: "Use to discover emails by query + domain. To scrape contacts from a known website use website_contacts_scraper.",
  },

  // Infra / utility
  web_unblocker: {
    summary:
      "Fetch the raw HTML/content of any URL through OWN's anti-bot proxy network, with optional JavaScript rendering. A general-purpose unblocker for sites without a dedicated tool.",
    whenToUse: "Use only when no dedicated API covers the target site. Prefer the structured tools (Amazon, Zillow, etc.) when one exists.",
  },

  // LLM relays
  chatgpt: {
    summary: "Relay a chat prompt to ChatGPT (OpenAI) and get the model's response.",
  },
  gemini: {
    summary: "Relay a chat prompt to Google Gemini and get the model's response.",
  },
  copilot: {
    summary: "Relay a prompt to Microsoft Copilot and get the response.",
  },
};
