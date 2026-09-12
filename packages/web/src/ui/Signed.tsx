/** Formats a number with an explicit sign — momentum is always shown this way. */
export function Signed({ value }: { readonly value: number }) {
  return <>{value > 0 ? `+${value}` : value}</>;
}
