/**
 * "Every automated rule behaviour is traceable to the rule entry that
 * triggered it" (CLAUDE.md, Non-negotiables). A TracedEffect's `clause`
 * must be a verbatim substring of the imported text it implements. Task
 * 1.9's traceability test walks every MoveAutomation spec and calls this
 * against the corresponding Move's `outcomes[tier].text` (or `text` for a
 * preRoll/method clause, which has no tier) — so a hand-authored effect
 * that has drifted from the Datasworn wording, or a Datasworn reword that
 * silently changes a move's mechanics, both fail the build instead of
 * shipping unnoticed.
 */
export function isVerbatimClause(clause: string, sourceText: string): boolean {
  if (clause.length === 0) {
    return false;
  }
  return sourceText.includes(clause);
}
