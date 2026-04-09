import { ArraySchema, Schema, type } from '@colyseus/schema';

export class PlayerSchema extends Schema {}

type('string')(PlayerSchema.prototype, 'id');
type('string')(PlayerSchema.prototype, 'name');
type('boolean')(PlayerSchema.prototype, 'connected');
type('boolean')(PlayerSchema.prototype, 'ready');
type('number')(PlayerSchema.prototype, 'seat');
type('number')(PlayerSchema.prototype, 'holeCardCount');

export class GameStateSchema extends Schema {}

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

export { ArraySchema };
