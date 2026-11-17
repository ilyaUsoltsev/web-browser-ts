import type { Response } from "./url.ts";

class ResponseCache {
  private cache: Map<string, Response> = new Map();

  get(url: string): Response | undefined {
    return this.cache.get(url);
  }

  set(url: string, response: Response): void {
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
