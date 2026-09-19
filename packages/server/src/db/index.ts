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
export { latestSessionId, readNarrativeEvents } from './event-store.js';
export {
  decideTruth,
  activateLaunch,
  saveLaunchDraft,
  saveSharedStarship,
  configureLaunchSector,
  establishLaunchConnection,
  reviseLaunchConnection,
  acceptLaunchIncident,
  amendLaunchFact,
  removeLaunchLocation,
  removeLaunchRoute,
  saveLaunchLocation,
  saveLaunchRoute,
  setStartingSettlement,
  setSectorLayout,
  saveLaunchTrouble,
  rollLaunchOracle,
  rollLaunchRecipe,
  proposeLaunchCreation,
  setLaunchFoundation,
  LaunchRejectedError,
  type DecideTruthRequest,
  type ActivateLaunchRequest,
  type SaveLaunchDraftRequest,
  type SaveSharedStarshipRequest,
  type ConfigureLaunchSectorRequest,
  type EstablishLaunchConnectionRequest,
  type AcceptLaunchIncidentRequest,
  type AmendLaunchFactRequest,
  type SaveLaunchLocationRequest,
  type SaveLaunchRouteRequest,
  type SetStartingSettlementRequest,
  type SetSectorLayoutRequest,
  type SaveLaunchTroubleRequest,
  type RollLaunchOracleRequest,
  type ProposeLaunchCreationRequest,
  type SetLaunchFoundationRequest,
} from './launch-commands.js';
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
  removeCharacter,
  reviseCharacter,
  CharacterRejectedError,
  LaunchCharacterRejectedError,
  UnknownCharacterError,
  UnknownProposalError,
  type CreateCharacterRequest,
  type CreatedCharacter,
  type RemoveCharacterRequest,
  type ReviseCharacterRequest,
} from './character-commands.js';
export { listCampaigns } from './campaign-queries.js';
export {
  checkTrigger,
  suggestActions,
  suggestMove,
  type CheckTriggerRequest,
  type SuggestActionsRequest,
  type SuggestMoveRequest,
} from './suggestion-commands.js';
export {
  OFFER_COMPLICATIONS_COMMAND_KIND,
  SET_COMPLICATION_COMMAND_KIND,
  offerComplications,
  setComplication,
  type OfferComplicationsRequest,
  type SetComplicationRequest,
} from './complication-commands.js';
export {
  BEAT_RECIPES,
  SCENE_FRAME_COMMAND_KIND,
  SCENE_RECIPES,
  WORLD_PASSAGE_COMMAND_KIND,
  WORLD_PASS_COMMAND_KIND,
  prepareSceneFrame,
  prepareWorldPass,
  runSceneFrame,
  runWorldPass,
  type PreparedSceneFrame,
  type PreparedWorldPass,
  type SceneFrameRequest,
  type WorldPassRequest,
} from './world-commands.js';
export {
  proposeCharacter,
  proposeIncidents,
  proposeConnection,
  proposeSector,
  proposeSettlement,
  proposeStarship,
  proposeTrouble,
  proposeTruth,
  type ProposalRequest,
  type ProposalRollSpec,
  type ProposeCharacterRequest,
} from './proposal-commands.js';
export {
  createCampaign,
  type CreateCampaignRequest,
  type CreatedCampaign,
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
  beginSession,
  endSession,
  proposeSessionSummary,
  prepareRecap,
  runRecap,
  RECAP_COMMAND_KIND,
  SESSION_BEGIN_COMMAND_KIND,
  SessionRejectedError,
  type BeginSessionRequest,
  type PreparedRecap,
  type RecapRequest,
} from './session-commands.js';
export {
  prepareBeatNarration,
  runBeatNarration,
  prepareCorrection,
  runCorrection,
  proposeAmount,
  requireOpenSession,
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
