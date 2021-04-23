/**
 * Cache for storing promises as a cache.
 */
export class PromiseCache {
  cache: Record<string, Promise<any>>;

  constructor() {
    this.cache = {};
  }

  has(key: string): boolean {
    return Boolean(this.cache[key]);
  }

  get(key: string): Promise<any> | undefined {
    return this.cache[key];
  }

  set(key: string, promise: Promise<any>): Promise<any> {
    this.cache[key] = promise;
    return this.cache[key];
  }
}
