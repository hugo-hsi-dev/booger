import { ArraySchema, Schema, type } from '@colyseus/schema';

export type GamePhase = 'lobby' | 'playing' | 'finished';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('boolean') connected = false;
}

export class GameState extends Schema {
  @type('string') phase: GamePhase = 'lobby';
  @type([PlayerState]) players = new ArraySchema<PlayerState>();
}
