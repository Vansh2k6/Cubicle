export function apiBase(override, dev) {
  return (override || (dev ? "http://localhost:8787" : "")).replace(/\/+$/, "");
}
