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
  UnknownProposalError,
  type CreateCharacterRequest,
  type CreatedCharacter,
} from './character-commands.js';
export { listCampaigns } from './campaign-queries.js';
export {
  proposeCharacter,
  proposeIncidents,
  type ProposalRequest,
  type ProposalRollSpec,
  type ProposeCharacterRequest,
} from './proposal-commands.js';
export {
  createCampaign,
  setTruth,
  addSectorLocation,
  addSectorRoute,
  swearIncitingVow,
  TruthRejectedError,
  SectorRouteRejectedError,
  IncitingVowRejectedError,
  type CreateCampaignRequest,
  type CreatedCampaign,
  type SetTruthRequest,
  type SetTruth,
  type AddSectorLocationRequest,
  type AddedSectorLocation,
  type AddSectorRouteRequest,
  type SwearIncitingVowRequest,
  type SwornIncitingVow,
} from './campaign-commands.js';
export {
  applyMoveChoice,
  burnMomentum,
  invokeMove,
  resolvePayThePriceMethod,
  MoveRejectedError,
  type ApplyMoveChoiceRequest,
  type BurnMomentumRequest,
  type BurnedMomentum,
  type ChainView,
  type InvokeMoveRequest,
  type InvokedMove,
  type InvokedMoveRoll,
  type PendingChoiceView,
  type ResolvePayThePriceRequest,
  type ResolvedPayThePrice,
} from './move-commands.js';
export {
  prepareBeatNarration,
  runBeatNarration,
  prepareCorrection,
  runCorrection,
  proposeAmount,
  AiRequestRefusedError,
  type AiCommandResult,
  type CorrectNarrationRequest,
  type NarrateBeatRequest,
  type Prepared,
  type PreparedBeat,
  type PreparedCorrection,
  type ProposeAmountRequest,
  type ProposedAmountResult,
} from './narration-commands.js';
