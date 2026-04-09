import { ArraySchema, Schema, type } from '@colyseus/schema';

import type {
  CampaignStatus,
  CardCode,
  GameOutcome,
  GamePhase,
  GamePlayer,
  GameState,
  TableStreet
} from '@booger/game';

export class PlayerSchema extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('boolean') connected = false;
  @type('boolean') ready = false;
  @type('number') seat = 0;
  @type('number') holeCardCount = 0;
  @type('number') confidenceRank = -1;
  @type('number') actualRank = -1;
  @type('string') handLabel = '';
}

export class GameStateSchema extends Schema {
  @type('string') roomId = '';
  @type('string') phase: GamePhase = 'lobby';
  @type('string') hostId = '';
  @type('number') maxPlayers = 6;
  @type('string') status = 'Waiting for players';
  @type('string') outcome: GameOutcome = 'pending';
  @type('string') campaignStatus: CampaignStatus = 'ongoing';
  @type('number') successfulHands = 0;
  @type('number') failedHands = 0;
  @type('number') targetSuccesses = 3;
  @type('number') maxFailures = 3;
  @type([PlayerSchema]) players = new ArraySchema<PlayerSchema>();
  @type('number') createdAt = 0;
  @type('number') startedAt = 0;
  @type('number') finishedAt = 0;
  @type('number') round = 0;
  @type('string') street: TableStreet = 'idle';
  @type('number') dealerSeat = -1;
  @type('number') activeSeat = -1;
  @type(['string']) communityCards = new ArraySchema<CardCode>();
}

function toPlayerSchema(player: GamePlayer) {
  const schema = new PlayerSchema();
  schema.id = player.id;
  schema.name = player.name;
  schema.connected = player.connected;
  schema.ready = player.ready;
  schema.seat = player.seat;
  schema.holeCardCount = player.holeCardCount;
  schema.confidenceRank = player.confidenceRank ?? -1;
  schema.actualRank = player.actualRank ?? -1;
  schema.handLabel = player.handLabel ?? '';
  return schema;
}

export function createRoomState(state: GameState): GameStateSchema {
  const roomState = new GameStateSchema();
  syncRoomState(roomState, state);
  return roomState;
}

export function syncRoomState(roomState: GameStateSchema, state: GameState) {
  roomState.roomId = state.roomId;
  roomState.phase = state.phase;
  roomState.hostId = state.hostId ?? '';
  roomState.maxPlayers = state.maxPlayers;
  roomState.status = state.status;
  roomState.outcome = state.outcome;
  roomState.campaignStatus = state.campaignStatus;
  roomState.successfulHands = state.successfulHands;
  roomState.failedHands = state.failedHands;
  roomState.targetSuccesses = state.targetSuccesses;
  roomState.maxFailures = state.maxFailures;
  roomState.createdAt = state.createdAt;
  roomState.startedAt = state.startedAt ?? 0;
  roomState.finishedAt = state.finishedAt ?? 0;
  roomState.round = state.round;
  roomState.street = state.street;
  roomState.dealerSeat = state.dealerSeat ?? -1;
  roomState.activeSeat = state.activeSeat ?? -1;
  roomState.players.clear();
  for (const player of state.players) {
    roomState.players.push(toPlayerSchema(player));
  }
  roomState.communityCards.clear();
  for (const card of state.communityCards) {
    roomState.communityCards.push(card);
  }
}
