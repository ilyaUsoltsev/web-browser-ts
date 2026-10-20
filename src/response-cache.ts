class ResponseCache {
  private cache: Map<string, string> = new Map();

  get(url: string): string | undefined {
    return this.cache.get(url);
  }

  set(url: string, response: string): void {
    this.cache.set(url, response);
  }

  has(url: string): boolean {
    return this.cache.has(url);
  }

  delete(url: string): void {
    this.cache.delete(url);
  }
}

const responseCache = new ResponseCache();

export default responseCache;
