/**
 * ANNA // GITHUB REST API WRAPPER
 * Clean GitHub API client with AbortController timeouts and retry
 * Version: ANNA-SLUT
 */

const GitHub = {
  config: {
    owner: null,
    repo: null,
    branch: 'main',
    token: null,
    timeout: 15000,
  },

  configure(cfg) {
    this.config = { ...this.config, ...cfg };
    this._validateConfig();
  },

  _validateConfig() {
    const { owner, repo, token } = this.config;
    if (!owner || !repo || !token) {
      throw new Error('GitHub.configure() requires: owner, repo, token');
    }
  },

  _headers() {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  },

  _encodeUtf8Base64(str) {
    const bytes = new TextEncoder().encode(String(str ?? ''));
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCodePoint(b); });
    return btoa(bin);
  },

  async request(method, endpoint, body = null, query = null) {
    this._validateConfig();

    const { owner, repo, timeout } = this.config;
    let url = `https://api.github.com/repos/${owner}/${repo}${endpoint}`;

    if (query) {
      const params = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v != null)
      );
      url += `?${params.toString()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: this._headers(),
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        const msg = data?.message || `GitHub API error: ${response.status}`;
        const err = new Error(msg);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        const tmo = new Error(`GitHub request timeout after ${timeout}ms: ${method} ${endpoint}`);
        tmo.code = 'ETIMEOUT';
        throw tmo;
      }

      throw error;
    }
  },

  async requestWithRetry(method, endpoint, body = null, query = null, retryOpts = {}) {
    const { maxRetries = 3, baseDelay = 1000, maxDelay = 60000, factor = 2 } = retryOpts;
    let delay = baseDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.request(method, endpoint, body, query);
      } catch (error) {
        const isRetryable = error.status >= 500 || error.code === 'ETIMEOUT';
        if (!isRetryable || attempt === maxRetries) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(delay, maxDelay)));
        delay *= factor;
      }
    }
  },

  async get(path, query = null) {
    return this.requestWithRetry('GET', `/contents/${path}`, null, query);
  },

  async put(path, opts) {
    const { content, message, sha = null, branch = null } = opts || {};
    const body = {
      message,
      content: this._encodeUtf8Base64(content),
      branch: branch || this.config.branch,
    };
    if (sha) body.sha = sha;
    return this.requestWithRetry('PUT', `/contents/${path}`, body);
  },

  async delete(path, opts) {
    const { message, sha } = opts || {};
    return this.requestWithRetry('DELETE', `/contents/${path}`, { message, sha });
  },

  async getSha(path, ref = null) {
    const query = ref ? { ref } : null;
    const data = await this.get(path, query);
    return data.sha;
  },

  // Supports both upsert(path, { content, message, branch }) and upsert(path, content, message, branch)
  async upsert(path, contentOrOpts, messageArg = null, branchArg = null) {
    const isObj = contentOrOpts && typeof contentOrOpts === 'object' && !Array.isArray(contentOrOpts);
    const content = isObj ? contentOrOpts.content : contentOrOpts;
    const message = isObj ? contentOrOpts.message : messageArg;
    const branch = isObj ? (contentOrOpts.branch || null) : (branchArg || null);
    const targetBranch = branch || this.config.branch;

    try {
      const sha = await this.getSha(path, targetBranch);
      return this.put(path, { content, message, sha, branch: targetBranch });
    } catch (error) {
      if (error.status === 404) {
        return this.put(path, { content, message, branch: targetBranch });
      }
      throw error;
    }
  },

  async listDir(path = '', ref = null) {
    const query = ref ? { ref } : null;
    return this.requestWithRetry('GET', `/contents/${path}`, null, query);
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GitHub;
}
