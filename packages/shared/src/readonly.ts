/**
 * Payload types are inferred from their zod schemas so there is exactly one
 * source of truth per event type, but `z.infer` produces mutable types and
 * the rest of the codebase is `readonly` throughout. `DeepReadonly` closes
 * that gap at the point of export.
 *
 * The conditional distributes over unions, so a discriminated union of
 * payloads stays a union of readonly members rather than collapsing.
 */
export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends readonly (infer U)[]
      ? readonly DeepReadonly<U>[]
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

/**
 * Checked before the object branch, and that order is load-bearing: a
 * branded ID is `string & { readonly __brand: '…' }`, which satisfies
 * `extends object` because of its intersection half. Without this guard the
 * mapped type would walk `String.prototype` and turn every `CharacterId`
 * into an unusable structural type.
 */
type Primitive = string | number | bigint | boolean | symbol | null | undefined;
