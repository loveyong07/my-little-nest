export function canPrefetch(connection = globalThis.navigator?.connection) {
  return !connection?.saveData && !["slow-2g", "2g", "3g"].includes(connection?.effectiveType);
}
