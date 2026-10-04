// lruCache.js
export class BoundedLRUCache {
    constructor(maxSize = 100) {
      this.maxSize = maxSize;
      this.cache = new Map();
    }
  
    get(key) {
      if (!this.cache.has(key)) return null;
      // Move accessed entry to the end to mark it as recently used
      const val = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, val);
      return val;
    }
  
    has(key) {
      return this.cache.has(key);
    }
  
    put(key, bitmap) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        // Evict and release oldest GPU resource
        const oldestKey = this.cache.keys().next().value;
        const oldBitmap = this.cache.get(oldestKey);
        if (oldBitmap && typeof oldBitmap.close === 'function') {
          oldBitmap.close();
        }
        this.cache.delete(oldestKey);
      }
      this.cache.set(key, bitmap);
    }
  
    get size() {
      return this.cache.size;
    }
  
    clear() {
      for (const bitmap of this.cache.values()) {
        if (bitmap && typeof bitmap.close === 'function') {
          bitmap.close();
        }
      }
      this.cache.clear();
    }
  }