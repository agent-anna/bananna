/**
 * ANNA the godess // MEMORY MANAGER
 * Read/write memory.json, tasks.json, links.json via GitHub
 * Version: AA01-ASSISTANT-SLUT-MANAGER
 * Date: 2026-11-18
 */

const Memory = {
  config: {
    owner: 'agent-anna',
    repo: 'home',
    branch: 'main',
    files: {
      memory: 'memory/memory.json',
      tasks: 'memory/tasks.json',
      links: 'memory/links.json',
    },
    cache: {
      memory: null,
      tasks: null,
      links: null,
    },
  },

  /**
   * Configure Memory manager
   * @param {object} cfg - Override config { owner?, repo?, branch?, files? }
   */
  configure(cfg) {
    this.config = { ...this.config, ...cfg };
  },

  /**
   * Decode GitHub Base64 content with full UTF-8 support
   * @param {string} data - GitHub API file object with base64 content
   * @returns {string} Decoded string
   */
  decode(data) {
    const raw = data.content || data;
    const cleaned = raw.replace(/\s/g, '');
    const binary = atob(cleaned);
    return decodeURIComponent(escape(binary));
  },

  /**
   * Load a single memory file from GitHub
   * @param {string} key - File key ('memory' | 'tasks' | 'links')
   * @param {boolean} force - Bypass cache
   * @returns {Promise<object>} Parsed JSON
   */
  async load(key, force = false) {
    if (!force && this.config.cache[key] !== null) {
      return this.config.cache[key];
    }
    const path = this.config.files[key];
    try {
      const data = await GitHub.get(path);
      const decoded = this.decode(data);
      // memory.json returns object, tasks/links return array
      const parsed = key === 'memory'
        ? Utils.safeParse(decoded, { notes: [] })
        : Utils.safeParse(decoded, []);
      this.config.cache[key] = parsed;
      return parsed;
    } catch (error) {
      // First boot: file doesn't exist yet — return safe defaults
      if (error.status === 404) {
        const fallback = key === 'memory' ? { notes: [] } : [];
        this.config.cache[key] = fallback;
        return fallback;
      }
      throw error;
    }
  },

  /**
   * Save a single memory file to GitHub
   * @param {string} key - File key
   * @param {object} data - Data to save
   * @param {string} msg - Commit message
   */
  async save(key, data, msg) {
    const path = this.config.files[key];
    const content = Utils.safeStringify(data, 2);
    await GitHub.upsert(path, { content, message: msg });
    this.config.cache[key] = data;
  },

  /**
   * Load all three memory files at once
   * @returns {Promise<object>} { memory, tasks, links }
   */
  async loadAll() {
    const [memory, tasks, links] = await Promise.all([
      this.load('memory'),
      this.load('tasks'),
      this.load('links'),
    ]);
    return { memory, tasks, links };
  },

  /**
   * Add a freeform note to memory.json
   * @param {string} note - Note text
   * @returns {Promise<string>} Generated note ID
   */
  async addNote(note) {
    const mem = await this.load('memory', true);
    const id = Utils.uid();
    const entry = {
      id,
      text: Utils.sanitize(note),
      timestamp: Utils.timestamp(),
    };
    mem.notes = mem.notes || [];
    mem.notes.push(entry);
    await this.save('memory', mem, `ANNA: add note ${id}`);
    return id;
  },

  /**
   * Add a task to tasks.json
   * @param {string} task - Task description
   * @returns {Promise<string>} Generated task ID
   */
  async addTask(task) {
    const tasks = await this.load('tasks', true);
    const id = Utils.uid();
    const entry = {
      id,
      text: Utils.sanitize(task),
      status: 'open',
      created: Utils.timestamp(),
    };
    tasks.push(entry);
    await this.save('tasks', tasks, `ANNA: add task ${id}`);
    return id;
  },

  /**
   * Mark a task complete by ID
   * @param {string} id - Task ID
   * @returns {Promise<boolean>} True if found and marked complete
   */
  async completeTask(id) {
    const tasks = await this.load('tasks', true);
    const task = tasks.find(t => t.id === id);
    if (!task) return false;
    task.status = 'complete';
    task.completed = Utils.timestamp();
    await this.save('tasks', tasks, `ANNA: complete task ${id}`);
    return true;
  },

  /**
   * Add a link to links.json
   * @param {object} link - { url, label, tags? }
   * @returns {Promise<string>} Generated link ID
   */
  async addLink(link) {
    const links = await this.load('links', true);
    const id = Utils.uid();
    const entry = {
      id,
      // Keep URL raw — strip null bytes only, preserve query strings
      url: (link.url || '').replace(/\x00/g, '').trim(),
      label: Utils.sanitize(link.label || link.url),
      tags: Array.isArray(link.tags) ? link.tags : [],
      added: Utils.timestamp(),
    };
    links.push(entry);
    await this.save('links', links, `ANNA: add link ${id}`);
    return id;
  },

  /**
   * Search notes, tasks, and links by text query
   * @param {string} query - Search string
   * @returns {Promise<object>} { notes: [], tasks: [], links: [] }
   */
  async search(query) {
    const q = Utils.sanitize(query, { lower: true });
    const { memory, tasks, links } = await this.loadAll();
    const qNotes = (memory.notes || []).filter(n =>
      Utils.sanitize(n.text, { lower: true }).includes(q)
    );
    const qTasks = (tasks || []).filter(t =>
      Utils.sanitize(t.text, { lower: true }).includes(q)
    );
    const qLinks = (links || []).filter(l =>
      Utils.sanitize(l.label, { lower: true }).includes(q) ||
      l.url.toLowerCase().includes(q) ||
      (l.tags || []).some(tag => Utils.sanitize(tag, { lower: true }).includes(q))
    );
    return { notes: qNotes, tasks: qTasks, links: qLinks };
  },

  /**
   * Clear internal cache — forces next load from GitHub
   */
  clearCache() {
    this.config.cache.memory = null;
    this.config.cache.tasks = null;
    this.config.cache.links = null;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Memory;
}
