/**
 * ANNA V3 // UTILITY FUNCTIONS
 * Clean, reusable helpers for the Anna engine
 * Version: AA01-V2-CLEAN
 * Date: 2026-11-18
 */

const Utils = {
  /**
   * Safe JSON parse — never throws
   * @param {string} str - Raw JSON string
   * @param {*} fallback - Fallback value on parse failure (default: null)
   * @returns {*} Parsed object or fallback
   */
  safeParse(str, fallback = null) {
    if (!str || typeof str !== 'string') return fallback;
    try {
      return JSON.parse(str);
    } catch (e) {
      return fallback;
    }
  },

  /**
   * Safe JSON stringify — handles circular refs
   * @param {*} obj - Object to stringify
   * @param {number} indent - Spaces for formatting (default: 0 = minified)
   * @returns {string} JSON string
   */
  safeStringify(obj, indent = 0) {
    const cache = new Set();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) return '[CIRCULAR]';
        cache.add(value);
      }
      return value;
    }, indent);
  },

  /**
   * Format timestamp for logs/reports
   * @param {Date|string|number} input - Date input
   * @param {object} options - Format options
   * @returns {string} Formatted timestamp
   */
  timestamp(input = new Date(), options = {}) {
    const date = input instanceof Date ? input : new Date(input);
    const { format = 'ISO', utc = false } = options;

    // UTC mode: format using UTC methods for correct timezone output
    if (utc) {
      const pad = (n) => String(n).padStart(2, '0');
      const y = date.getUTCFullYear();
      const mo = pad(date.getUTCMonth() + 1);
      const d = pad(date.getUTCDate());
      const h = pad(date.getUTCHours());
      const mi = pad(date.getUTCMinutes());
      const s = pad(date.getUTCSeconds());
      const ms = pad(date.getUTCMilliseconds());

      switch (format) {
        case 'ISO':
          return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
        case 'SHORT':
          return `${y}-${mo}-${d}`;
        case 'LONG':
          return `${date.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'long' })}, ${y}-${mo}-${d}`;
        case 'LOG':
          return `${y}-${pad(date.getUTCMonth() + 1)}-${d} ${h}-${mi}-${s}`;
        case 'FILE':
          return `${y}-${mo}-${d}T${h}-${mi}-${s}`;
        default:
          return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
      }
    }

    // Local time mode
    switch (format) {
      case 'ISO':
        return date.toISOString();
      case 'SHORT':
        return date.toLocaleDateString('en-US', {
          year: 'numeric', month: '2-digit', day: '2-digit'
        });
      case 'LONG':
        return date.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
      case 'LOG':
        return date.toISOString().replace(/[:.]/g, '-').replace('T', ' ').slice(0, 19);
      case 'FILE':
        return date.toISOString().replace(/[:.]/g, '-');
      default:
        return date.toISOString();
    }
  },

  /**
   * Sanitize file path — prevent directory traversal
   * @param {string} path - Raw path
   * @param {object} options - Path options
   * @returns {string} Safe path
   */
  sanitizePath(path, options = {}) {
    const { allowLeading = true } = options;

    if (!path || typeof path !== 'string') return '';
    let clean = path;

    // Remove null bytes and control characters
    clean = clean.replace(/[\x00-\x1F\x7F]/g, '');

    // Block common traversal patterns
    clean = clean.replace(/\.\.\//g, '');
    clean = clean.replace(/\.\.\.$/g, '');
    clean = clean.replace(/^\.\.\//, '');

    // Normalize Windows backslashes to forward slashes
    clean = clean.replace(/\\/g, '/');

    // Collapse multiple slashes
    clean = clean.replace(/\/+/g, '/');

    // If leading slash not allowed, trim it
    if (!allowLeading) {
      clean = clean.replace(/^\/+/, '');
    }

    // Block absolute paths (Unix)
    if (!allowLeading && clean.startsWith('/')) {
      clean = clean.replace(/^\/+/, '');
    }

    // Block Windows absolute paths
    if (/^[a-zA-Z]:/.test(clean)) {
      clean = clean.replace(/^[a-zA-Z]:/, '');
    }

    // Final trim
    clean = clean.trim();

    // Block empty or root-only paths
    if (!clean || clean === '/' || clean === 'A1') return '';

    return clean;
  },

  /**
   * Sanitize string — prevent XSS and injection
   * @param {string} str - Raw string
   * @param {object} options - Sanitization options
   * @returns {string} Safe string
   */
  sanitize(str, options = {}) {
    const { allowHTML = false, maxLength = Infinity, lower = false } = options;

    if (!str || typeof str !== 'string') return '';
    let clean = str;

    // Remove null bytes
    clean = clean.replace(/\x00/g, '');

    if (!allowHTML) {
      // Escape HTML entities
      clean = clean
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    } else {
      // Strip dangerous tags if HTML allowed
      clean = clean.replace(/<script[^>]*>.*?<\/script>/gi, '');
      clean = clean.replace(/<iframe[^>]*>.*?<\/iframe>/gi, '');
      clean = clean.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    }

    // Trim whitespace
    clean = clean.trim();

    // Truncate
    if (clean.length > maxLength) {
      clean = clean.slice(0, maxLength);
    }

    // Lowercase if requested
    if (lower) clean = clean.toLowerCase();

    return clean;
  },

  /**
   * Debounce function calls
   * @param {function} fn - Function to debounce
   * @param {number} delay - Delay in ms
   * @returns {function} Debounced function
   */
  debounce(fn, delay = 300) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * Throttle function calls
   * @param {function} fn - Function to throttle
   * @param {number} limit - Minimum interval in ms
   * @returns {function} Throttled function
   */
  throttle(fn, limit = 300) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },

  /**
   * Generate unique ID
   * @param {number} length - ID length (default: 12)
   * @returns {string} Unique ID
   */
  uid(length = 12) {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 2 + length);
  },

  /**
   * Clamp number between min and max
   * @param {number} num - Input number
   * @param {number} min - Minimum
   * @param {number} max - Maximum
   * @returns {number} Clamped number
   */
  clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  },

  /**
   * Retry wrapper with exponential backoff
   * @param {function} fn - Async function to retry
   * @param {object} options - Retry options
   * @returns {Promise} Resolved value or thrown error
   */
  async retry(fn, options = {}) {
    const { maxRetries = 3, baseDelay = 1000, maxDelay = 60000, factor = 2 } = options;
    let delay = baseDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.min(delay, maxDelay)));
        delay *= factor;
      }
    }
  },

  /**
   * Build GitHub API URL for a repo path
   * @param {string} repo - Full repo path (e.g. "owner/repo")
   * @param {string} path - File path within repo
   * @returns {string} GitHub API URL
   */
  ghUrl(repo, path) {
    return `https://api.github.com/repos/${repo}/contents/${path}`;
  },

  /**
   * Sleep for ms
   * @param {number} ms - Milliseconds
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
