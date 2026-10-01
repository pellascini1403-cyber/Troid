/** Returned by every subscription API. Calling it more than once is always safe. */
export type Unsubscribe = () => void;

export interface Disposable {
  dispose(): void;
}

export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${String(value)}`);
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invariant violated: ${message}`);
}

/** Recursively readonly, for data definitions that must never be mutated at runtime. */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
