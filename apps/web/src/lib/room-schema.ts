import { ArraySchema, Schema, type } from '@colyseus/schema';

export class PlayerSchema extends Schema {
  declare id: string;
  declare name: string;
  declare connected: boolean;
  declare ready: boolean;
  declare seat: number;
  declare holeCardCount: number;
}

type('string')(PlayerSchema.prototype, 'id');
type('string')(PlayerSchema.prototype, 'name');
type('boolean')(PlayerSchema.prototype, 'connected');
type('boolean')(PlayerSchema.prototype, 'ready');
type('number')(PlayerSchema.prototype, 'seat');
type('number')(PlayerSchema.prototype, 'holeCardCount');

export class GameStateSchema extends Schema {
  declare roomId: string;
  declare phase: string;
  declare hostId: string;
  declare maxPlayers: number;
  declare status: string;
  declare players: ArraySchema<PlayerSchema>;
  declare createdAt: number;
  declare startedAt: number;
  declare finishedAt: number;
  declare round: number;
  declare street: string;
  declare dealerSeat: number;
  declare activeSeat: number;
  declare communityCards: ArraySchema<string>;
}

type('string')(GameStateSchema.prototype, 'roomId');
type('string')(GameStateSchema.prototype, 'phase');
type('string')(GameStateSchema.prototype, 'hostId');
type('number')(GameStateSchema.prototype, 'maxPlayers');
type('string')(GameStateSchema.prototype, 'status');
type([PlayerSchema])(GameStateSchema.prototype, 'players');
type('number')(GameStateSchema.prototype, 'createdAt');
type('number')(GameStateSchema.prototype, 'startedAt');
type('number')(GameStateSchema.prototype, 'finishedAt');
type('number')(GameStateSchema.prototype, 'round');
type('string')(GameStateSchema.prototype, 'street');
type('number')(GameStateSchema.prototype, 'dealerSeat');
type('number')(GameStateSchema.prototype, 'activeSeat');
type(['string'])(GameStateSchema.prototype, 'communityCards');
