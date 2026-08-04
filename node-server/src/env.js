// Simple in-memory Key-Value store to mock Cloudflare Workers KV
class MemoryKV {
  constructor() {
    this.store = new Map();
  }

  async get(key, type = 'text') {
    const item = this.store.get(key);
    if (!item) return null;
    
    if (item.expires && Date.now() > item.expires) {
      this.store.delete(key);
      return null;
    }
    
    if (type === 'json') {
      try {
        return JSON.parse(item.value);
      } catch (e) {
        return null;
      }
    }
    return item.value;
  }

  async put(key, value, options = {}) {
    const expires = options.expirationTtl ? Date.now() + (options.expirationTtl * 1000) : null;
    this.store.set(key, { value, expires });
  }

  async delete(key) {
    this.store.delete(key);
  }
}

export const env = {
  KV: new MemoryKV()
};
