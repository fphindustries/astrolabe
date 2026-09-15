import type { EntityId, EntityState } from '@astrolabe/shared';

/**
 * Pure view-model for NPC and location cards (task 5.6). Factions and the
 * ship entity are deliberately excluded: no task calls for a faction/ship
 * card in the play screen, and the visual starmap is explicitly out of
 * scope for Milestone 1.
 */

export interface EntityCardView {
  readonly id: EntityId;
  readonly kind: 'npc' | 'location';
  readonly name: string;
  readonly establishedBy: 'ai' | 'player';
}

export function entityCards(
  entities: Readonly<Record<EntityId, EntityState>>,
): readonly EntityCardView[] {
  return Object.values(entities)
    .filter(isCardableEntity)
    .map((entity) => ({
      id: entity.id,
      kind: entity.kind,
      name: entity.name,
      establishedBy: entity.provenance.establishedBy,
    }));
}

/** A recipe slot as a label: `first_look` → "First look". */
export function fieldLabel(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isCardableEntity(
  entity: EntityState,
): entity is EntityState & { readonly kind: 'npc' | 'location' } {
  return entity.kind === 'npc' || entity.kind === 'location';
}
