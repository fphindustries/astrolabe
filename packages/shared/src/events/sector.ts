import * as z from 'zod';

import { EntityIdSchema } from '../ids.js';

/**
 * A route between two sector locations (task 4.3, D-32, D-103). Locations
 * themselves reuse `entity.established` (`kind: 'location'`) unchanged — a
 * route is the one thing that event's per-entity `fields` bag can't model
 * well, since it is a relation between two entities rather than a fact
 * about one. This is its own event type, D-103, rather than a field on
 * either location, so a route can be referenced (and voided) on its own
 * terms — see `EVENT_TYPE_META`'s `references` for this type.
 */
export const SectorRouteAddedSchema = z.object({
  fromLocationId: EntityIdSchema,
  toLocationId: EntityIdSchema,
});
