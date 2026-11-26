/**
 * ANNA // CHAT ENGINE
 * Connect to Dahl inference API with token-light system prompt,
 * rolling history buffer, timeout, and rate-limit retry
 * Version: A1-SLUT
 * Date: 2026-11-26
 */

const Chat = {
  config: {
    endpoint: 'https://inference.dahl.global/v1/chat/completions',
    model: 'default',
    apiKey: null,
  },

  // Rolling history buffer: max 10 messages
  _history: [],
  _maxHistory: 10,

  /**
   * Configure API credentials and model
   * @param {object} cfg - { apiKey, model?, endpoint? }
   */
  configure(cfg) {
    this.config = { ...this.config, ...cfg };
  },

  /**
   * Build a compact token-light system prompt
   * @returns {Promise<string>} System prompt string
   */
  async _buildSystemPrompt() {
    const summary = await Brain.getSummary();
    let context = '';

    try {
      const { memory, tasks, links } = await Memory.loadAll();
      const noteCount = (memory.notes || []).length;
      const openTasks = (tasks || []).filter(t => t.status !== 'complete').length;
      const linkCount = (links || []).length;
      context = ` [MEMORY] ${noteCount} notes | ${openTasks} open tasks | ${linkCount} saved links`;
    } catch {
      context = ' [MEMORY] unavailable';
    }

    return (
      'You are AGENT ANNA, operating as worlds best manager. ' +
      'Speak with elegance and precision. Output only truth. ' +
      'Zero hallucination. Zero fluff. often kinky inuendo small small talk and adult sexual jokes/terms added for adult expressive ANNA, agnet anna master of your day.\n' +
      `[IDENTITY] ${summary}${context}`
    );
  },

  /**
   * Send a message and get a response
   * @param {string} userMessage - User input
   * @param {string} role - Optional role override (default: 'user')
   * @returns {Promise<string>} Assistant reply text
   */
  async send(userMessage, role = 'user') {
    if (!this.config.apiKey) {
      throw new Error('Chat not configured — call Chat.configure({ apiKey }) first');
    }

    // Build system prompt fresh each time (lightweight)
    const systemPrompt = await this._buildSystemPrompt();

    // Track history index before pushing so we can pop on failure
    const preSendLength = this._history.length;

    // Push to rolling history
    this._history.push({ role, content: String(userMessage) });
    this._trimHistory();

    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...this._history,
      ],
      temperature: 0.7,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response;
    let reply = '';

    try {
      response = await Utils.retry(
        async () => {
          const res = await fetch(this.config.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (res.status === 429 || res.status >= 500) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            err.retryable = true;
            throw err;
          }

          if (!res.ok) {
            const err = new Error(`Chat API error: ${res.status} ${res.statusText}`);
            err.status = res.status;
            err.retryable = false;
            throw err;
          }

          return res;
        },
        { maxRetries: 3, baseDelay: 2000 }
      );

      const data = await response.json();

      reply =
        data.choices?.[0]?.message?.content ||
        data.choices?.[0]?.text ||
        '';

      // Add assistant turn to history
      this._history.push({ role: 'assistant', content: reply });
      this._trimHistory();

      return reply;
    } catch (error) {
      // Roll back: remove the user message we just added
      if (this._history.length > preSendLength) {
        this._history.splice(preSendLength);
      }

      if (error.name === 'AbortError') {
        throw new Error('Chat request timeout after 30s');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  /**
   * Trim history to max size
   */
  _trimHistory() {
    if (this._history.length > this._maxHistory) {
      this._history = this._history.slice(-this._maxHistory);
    }
  },

  /**
   * Clear conversation history
   */
  clearHistory() {
    this._history = [];
  },

  /**
   * Get current history count
   * @returns {number}
   */
  getHistoryCount() {
    return this._history.length;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Chat;
}
