/**
 * The store: the only part of the server that does I/O.
 *
 * `projection/` stays pure and is tested without a database (task 2.4a);
 * everything that touches Postgres lives here and gets a smaller
 * integration suite against a real server.
 */

export { createDb, databaseUrlFromEnv, toTimestamp, type DbOptions } from './client.js';
export { MIGRATIONS, migrate, type Migration, type MigrationOutcome } from './migrate.js';
export {
  appendCommand,
  readEvents,
  readEventsByCommand,
  type AppendRequest,
  type AppendResult,
  type NewEvent,
} from './event-store.js';
export { uuidv7 } from './uuid.js';
export { readNarrativeEvents } from './event-store.js';
export { previewVoid, voidEvent, VoidRefusedError, type VoidRequest } from './void-command.js';
export {
  overrideState,
  requestNarrationCorrection,
  reviseNarration,
  AmendRefusedError,
  type AmendRefusalReason,
  type CorrectionRequest,
  type OverrideRequest,
  type OverrideTarget,
  type RevisionRequest,
} from './amend-commands.js';
export {
  createCharacter,
  CharacterRejectedError,
  type CreateCharacterRequest,
  type CreatedCharacter,
} from './character-commands.js';
