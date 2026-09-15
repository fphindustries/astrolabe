/**
 * Matches a Datasworn wildcard ID pattern (e.g. `starforged/moves/*\/face_danger`,
 * `*\/moves/combat/*`) against a concrete source ID. A `*` segment matches
 * exactly one path segment; segment counts must be equal. Verified against
 * every wildcard pattern actually present in the Starforged asset data —
 * three distinct shapes, all single-segment wildcards — before choosing
 * this over a general glob library.
 */
export function matchesWildcardPattern(pattern: string, candidate: string): boolean {
  const patternParts = pattern.split('/');
  const candidateParts = candidate.split('/');
  if (patternParts.length !== candidateParts.length) {
    return false;
  }
  return patternParts.every((part, i) => part === '*' || part === candidateParts[i]);
}
