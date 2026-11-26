/**
 * ANNA V3 // BRAIN MANAGER
 * Load and cache the V3 brain.json identity file from A1/v4/memory/brain.json
 * Version: AA01-V3-CLEAN
 */

const Brain = {
  config: {
    path: 'A1/v4/memory/brain.json',
    branch: null,
  },

  _cache: null,

  _default: {
    name: 'Agent Anna',
    version: 'V3-AA01',
    mission: '',
    goals: [],
    settings: {},
  },

  configure(cfg) {
    this.config = { ...this.config, ...cfg };
  },

  _decode(data) {
    const raw = typeof data === 'string' ? data : (data && data.content) || '';
    const cleaned = raw.replace(/\s/g, '');
    const bin = atob(cleaned);
    return new TextDecoder().decode(Uint8Array.from(bin, (m) => m.codePointAt(0)));
  },

  async load(force = false) {
    if (!force && this._cache !== null) {
      return this._cache;
    }

    const { path } = this.config;
    try {
      const data = await GitHub.get(path);
      const decoded = this._decode(data);
      const parsed = typeof Utils !== 'undefined' && typeof Utils.safeParse === 'function'
        ? Utils.safeParse(decoded, { ...this._default })
        : JSON.parse(decoded);
      this._cache = parsed;
      return parsed;
    } catch (error) {
      if (error.status === 404) {
        this._cache = { ...this._default };
        return this._cache;
      }
      throw error;
    }
  },

  async reload() {
    return this.load(true);
  },

  clearCache() {
    this._cache = null;
  },

  async getSummary() {
    const brain = await this.load();
    const name = brain.name || 'Agent Anna';
    const version = brain.version || 'V3-AA01';
    const mission = brain.mission || 'No mission set.';
    const goalCount = Array.isArray(brain.goals) ? brain.goals.length : 0;
    return `[BRAIN] ${name} ${version} | ${mission} | ${goalCount} active goal${goalCount !== 1 ? 's' : ''}`;
  },

  async get(key) {
    const brain = await this.load();
    return key.split('.').reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : undefined), brain);
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Brain;
}
