/**
 * Payload types are inferred from their zod schemas so there is exactly one
 * source of truth per event type, but `z.infer` produces mutable types and
 * the rest of the codebase is `readonly` throughout. `DeepReadonly` closes
 * that gap at the point of export, and `DeepMutable` undoes it so the two
 * can be checked against each other — see `_SCHEMA_MATCHES_TYPE` in
 * `events/index.ts`. Without that check the `readonly` here would be
 * decoration nothing enforces.
 *
 * Both are homomorphic mapped types over the object branch, with no special
 * case for arrays. That is deliberate: a homomorphic mapping preserves
 * tuple-ness and arity, so `dice.rolled`'s `challengeDice` stays
 * `readonly [number, number]`. An explicit `T extends (infer U)[]` branch
 * would flatten it to `readonly number[]` and lose the guarantee that there
 * are exactly two challenge dice.
 */
export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends AnyFunction
    ? T
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type DeepMutable<T> = T extends Primitive
  ? T
  : T extends AnyFunction
    ? T
    : T extends object
      ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
      : T;

/**
 * Checked before the object branch, and that order is load-bearing: a
 * branded ID is `string & { readonly __brand: '…' }`, which satisfies
 * `extends object` because of its intersection half. Without this guard the
 * mapped type would walk `String.prototype` and turn every `CharacterId`
 * into an unusable structural type.
 */
type Primitive = string | number | bigint | boolean | symbol | null | undefined;

/** Likewise: a function is an object, and mapping over one loses its call signature. */
type AnyFunction = (...args: never[]) => unknown;
