/**
 * @typedef {Record<string, string | number | boolean | null | undefined>} TelemetryEvent
 * @typedef {(event: TelemetryEvent) => void} TelemetryEmitter
 */

/**
 * Creates a safe, non-throwing telemetry emitter for server-side cache and upstream metrics.
 * Logs structured JSON in Vercel / explicit telemetry environments while keeping tests quiet.
 *
 * @param {TelemetryEmitter | null | undefined} [onEvent]
 * @param {Record<string, string | undefined>} [env]
 * @returns {TelemetryEmitter}
 */
export function createTelemetryEmitter(onEvent = null, env = globalThis.process?.env ?? {}) {
  const logToConsole = env?.NEST_TELEMETRY === "1" || env?.VERCEL === "1";
  return function emitTelemetry(event) {
    if (!event || typeof event !== "object") return;
    const payload = {
      scope: "nest-telemetry",
      ...event,
    };
    if (typeof onEvent === "function") {
      try {
        onEvent(payload);
      } catch {
        // Telemetry listeners must never interrupt request handling.
      }
    }
    if (logToConsole) {
      try {
        console.info(JSON.stringify(payload));
      } catch {
        // Console serialization errors must never fail a route.
      }
    }
  };
}
