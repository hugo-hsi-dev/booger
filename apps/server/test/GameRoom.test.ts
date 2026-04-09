import assert from 'node:assert/strict';
import test from 'node:test';

import { type Client } from 'colyseus';

import { addPlayer, createInitialGameState, setPlayerReady, startGame } from '@booger/game';

import { GameRoom } from '../src/rooms/GameRoom.ts';

function flushMicrotasks() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

function createClient(sessionId: string) {
  return {
    sessionId,
    send() {},
    error() {}
  } as Client;
}

class TestGameRoom extends GameRoom {
  lockCalls = 0;
  unlockCalls = 0;

  override async lock() {
    this.lockCalls += 1;
  }

  override async unlock() {
    this.unlockCalls += 1;
  }
}

function createPlayingState() {
  let state = createInitialGameState('server-room', 6);
  state = addPlayer(state, { id: 'alice', name: 'Alice', connected: true });
  state = addPlayer(state, { id: 'bob', name: 'Bob', connected: true });
  state = setPlayerReady(state, 'alice', true);
  state = setPlayerReady(state, 'bob', true);
  return startGame(state, () => 0.25);
}

test('GameRoom locks when play begins and unlocks again after the room returns to lobby', async () => {
  const room = new TestGameRoom();

  room.onCreate();
  await flushMicrotasks();

  assert.equal(room.unlockCalls, 1);
  assert.equal(room.lockCalls, 0);

  const playingState = createPlayingState();
  (room as unknown as { gameState: ReturnType<typeof createPlayingState>; syncState: () => void }).gameState = playingState;
  (room as unknown as { syncState: () => void }).syncState();
  await flushMicrotasks();

  assert.equal(room.lockCalls, 1);

  room.onLeave(createClient('bob'));
  await flushMicrotasks();

  const gameState = (room as unknown as { gameState: ReturnType<typeof createPlayingState> }).gameState;

  assert.equal(gameState.phase, 'lobby');
  assert.equal(gameState.players.length, 1);
  assert.equal(gameState.players[0]?.id, 'alice');
  assert.equal(room.unlockCalls, 2);
  assert.equal(room.lockCalls, 1);
  assert.equal(room.state.phase, 'lobby');
  assert.equal(room.state.players.length, 1);
});
