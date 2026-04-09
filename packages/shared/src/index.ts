import { ArraySchema, Schema, type } from '@colyseus/schema';

import type { GamePhase, GamePlayer, GameState } from '@booger/game';

export class PlayerSchema extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('boolean') connected = false;
  @type('boolean') ready = false;
  @type('number') seat = 0;
}

export class GameStateSchema extends Schema {
  @type('string') roomId = '';
  @type('string') phase: GamePhase = 'lobby';
  @type('string') hostId = '';
  @type('number') maxPlayers = 6;
  @type('string') status = 'Waiting for players';
  @type([PlayerSchema]) players = new ArraySchema<PlayerSchema>();
  @type('number') createdAt = 0;
  @type('number') startedAt = 0;
  @type('number') finishedAt = 0;
}

function toPlayerSchema(player: GamePlayer) {
  const schema = new PlayerSchema();
  schema.id = player.id;
  schema.name = player.name;
  schema.connected = player.connected;
  schema.ready = player.ready;
  schema.seat = player.seat;
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
  roomState.createdAt = state.createdAt;
  roomState.startedAt = state.startedAt ?? 0;
  roomState.finishedAt = state.finishedAt ?? 0;
  roomState.players.splice(0, roomState.players.length, ...state.players.map(toPlayerSchema));
}
