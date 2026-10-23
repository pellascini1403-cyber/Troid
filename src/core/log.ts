export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  scope: string;
  message: string;
}

export type LogSink = (entry: LogEntry) => void;

const RING_SIZE = 100;
const ring: LogEntry[] = [];
const onceKeys = new Set<string>();

let sink: LogSink = (e) => {
  const line = `[${e.scope}] ${e.message}`;
  if (e.level === 'error') console.error(line);
  else if (e.level === 'warn') console.warn(line);
  else if (e.level === 'info') console.info(line);
  else console.debug(line);
};

function write(level: LogLevel, scope: string, message: string): void {
  const entry: LogEntry = { level, scope, message };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  sink(entry);
}

export interface ScopedLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** Logs a warning only the first time `key` is seen (per-frame code must never spam the console). */
  warnOnce(key: string, message: string): void;
}

export const log = {
  scope(scope: string): ScopedLogger {
    return {
      debug: (m) => write('debug', scope, m),
      info: (m) => write('info', scope, m),
      warn: (m) => write('warn', scope, m),
      error: (m) => write('error', scope, m),
      warnOnce: (key, m) => {
        const k = `${scope}:${key}`;
        if (onceKeys.has(k)) return;
        onceKeys.add(k);
        write('warn', scope, m);
      },
    };
  },
  /** Redirect output (tests silence it; the debug overlay mirrors it). */
  setSink(next: LogSink): void {
    sink = next;
  },
  recent(): readonly LogEntry[] {
    return ring;
  },
  resetOnce(): void {
    onceKeys.clear();
  },
};

/**
 * An error as one text that says WHAT it was and where: Chromium's `stack` begins with the name and the message, but Firefox's and Safari's list only the places — a report from them would say where and not why.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const head = `${error.name}: ${error.message}`;
  if (!error.stack) return head;
  return error.stack.startsWith(error.name) ? error.stack : `${head}\n${error.stack}`;
}
