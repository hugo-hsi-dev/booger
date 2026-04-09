import { ArraySchema, Schema, type } from '@colyseus/schema';

export class PlayerSchema extends Schema {
  declare id: string;
  declare name: string;
  declare connected: boolean;
  declare ready: boolean;
  declare seat: number;
}

type('string')(PlayerSchema.prototype, 'id');
type('string')(PlayerSchema.prototype, 'name');
type('boolean')(PlayerSchema.prototype, 'connected');
type('boolean')(PlayerSchema.prototype, 'ready');
type('number')(PlayerSchema.prototype, 'seat');

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
