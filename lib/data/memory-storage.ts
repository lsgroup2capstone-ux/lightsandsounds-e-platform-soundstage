/** In-memory view of server records; business data is not persisted in the browser. */
export class MemoryStorage {
  constructor(public values: Record<string, string> = {}) {}
  get length() { return Object.keys(this.values).length }
  key(index: number) { return Object.keys(this.values)[index] ?? null }
  getItem(key: string) { return this.values[key] ?? null }
  setItem(key: string, value: string) { this.values[key] = value }
  removeItem(key: string) { delete this.values[key] }
  clear() { this.values = {} }
}
