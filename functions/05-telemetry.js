/**
 * ANNA V3 // TELEMETRY MODULE
 * Live web fetch, search, and crypto price telemetry
 * Version: AA01-V2-CLEAN
 * Date: 2026-11-18
 */

const Telemetry = {
  // In-memory cache: { data, timestamp }
  _cryptoCache: null,
  _cacheAge: null,
  _cacheTTL: 60000, // 60 seconds

  /**
   * Truncate string to max token estimate (4 chars per token)
   * @param {string} str - Input string
   * @param {number} maxTokens - Max token estimate
   * @returns {string} Truncated string
   */
  _truncate(str, maxTokens) {
    const maxChars = maxTokens * 4;
    if (!str || str.length <= maxChars) return str || '';
    return str.slice(0, maxChars) + '\n\n[OUTPUT TRUNCATED — token limit reached]';
  },

  /**
   * Fetch any URL and return as markdown via Jina reader
   * @param {string} url - Full URL to fetch
   * @param {number} maxTokens - Truncate output at this many tokens
   * @returns {Promise<string>} Markdown content
   */
  async fetchUrl(url, maxTokens = 500) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const readerUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
      const response = await fetch(readerUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`fetchUrl failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      return this._truncate(text, maxTokens);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`fetchUrl timeout after 15s: ${url}`);
      }
      throw error;
    }
  },

  /**
   * Search the live web via Jina search
   * @param {string} query - Search query
   * @param {number} maxTokens - Truncate output at this many tokens
   * @returns {Promise<string>} Search results as markdown
   */
  async searchWeb(query, maxTokens = 500) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const searchUrl = `https://s.jina.ai/${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`searchWeb failed: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      return this._truncate(text, maxTokens);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`searchWeb timeout after 15s: ${query}`);
      }
      throw error;
    }
  },

  /**
   * Fetch live BTC and DOGE USD prices from CoinGecko
   * Cached for 60 seconds to avoid rate limits
   * @returns {Promise<object>} { bitcoin: { usd }, dogecoin: { usd }, _cached, _age }
   */
  async getCryptoPrices() {
    const now = Date.now();

    // Return cached result if fresh
    if (
      this._cryptoCache &&
      this._cacheAge &&
      now - this._cacheAge < this._cacheTTL
    ) {
      return this._cryptoCache;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const apiUrl =
        'https://api.coingecko.com/api/v3/simple/price' +
        '?ids=bitcoin,dogecoin&vs_currencies=usd&include_24hr_change=true';

      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();

      const result = {
        bitcoin: {
          usd: data.bitcoin?.usd ?? null,
          change24h: data.bitcoin?.usd_24h_change ?? null,
        },
        dogecoin: {
          usd: data.dogecoin?.usd ?? null,
          change24h: data.dogecoin?.usd_24h_change ?? null,
        },
        _cached: false,
        _timestamp: new Date().toISOString(),
      };

      // Cache the result
      this._cryptoCache = result;
      this._cacheAge = now;

      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      // On error, return stale cache if available (don't throw)
      if (this._cryptoCache) {
        const stale = { ...this._cryptoCache, _cached: true };
        return stale;
      }

      if (error.name === 'AbortError') {
        throw new Error('CoinGecko request timeout after 15s');
      }
      throw error;
    }
  },

  /**
   * Clear the crypto price cache
   */
  clearCache() {
    this._cryptoCache = null;
    this._cacheAge = null;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Telemetry;
}
