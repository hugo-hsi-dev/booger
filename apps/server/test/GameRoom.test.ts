import assert from 'node:assert/strict';
import test from 'node:test';

import { type Client } from 'colyseus';

import {
  addPlayer,
  createInitialGameState,
  type GameState
} from '@booger/game';
import { createRoomState } from '@booger/shared';

import { GameRoom } from '../src/rooms/GameRoom.ts';

function flushMicrotasks() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

type TestClient = Client & {
  sent: Array<{ type: string | number; message: unknown }>;
  errors: Array<{ code: number; message?: string }>;
};

type GameRoomAccess = {
  gameState: GameState;
  syncState(): void;
  handleLobbyAction(client: Client, message: { type: 'set-ready' | 'start-game'; ready?: boolean }): void;
  handleTableAction(
    client: Client,
    message:
      | { type: 'advance-street' | 'resolve-showdown' | 'restart-run' | 'next-hand' | 'sync-private-state' }
      | { type: 'set-confidence'; confidenceRank?: number | null }
  ): void;
  sendPrivateState(client: Client): void;
};

function createClient(sessionId: string): TestClient {
  const sent: TestClient['sent'] = [];
  const errors: TestClient['errors'] = [];

  return {
    sessionId,
    sent,
    errors,
    send(type, message) {
      sent.push({ type, message });
    },
    error(code, message) {
      errors.push({ code, message });
    }
  } as TestClient;
}

class TestGameRoom extends GameRoom {
  lockCalls = 0;
  unlockCalls = 0;
  nextReconnectionClient: TestClient | null = null;

  override async lock() {
    this.lockCalls += 1;
  }

  override async unlock() {
    this.unlockCalls += 1;
  }

  override allowReconnection(previousClient: Client, seconds: number | 'manual'): any {
    void previousClient;
    void seconds;

    if (!this.nextReconnectionClient) {
      return Promise.reject(new Error('No reconnection client set'));
    }

    return Promise.resolve(this.nextReconnectionClient);
  }
}

function createPlayingState() {
  let state = createInitialGameState('server-room', 6);
  state = addPlayer(state, { id: 'alice', name: 'Alice', connected: true });
  state = addPlayer(state, { id: 'bob', name: 'Bob', connected: true });
  return {
    ...state,
    phase: 'playing',
    round: 1,
    street: 'pre-flop',
    activeSeat: 0,
    dealerSeat: 0,
    communityCards: ['2H', '2D', '7S', '9C', 'KD'],
    deck: ['5S', '6S'],
    privateHands: {
      alice: ['AS', 'AH'],
      bob: ['KC', 'KD']
    },
    players: state.players.map((player) => ({
      ...player,
      ready: false,
      holeCardCount: 2,
      confidenceRank: null,
      actualRank: null,
      handLabel: null
    }))
  };
}

test('GameRoom rejects non-host lobby and table actions with typed errors', async () => {
  const room = new TestGameRoom();
  room.onCreate();
  await flushMicrotasks();

  const host = createClient('host');
  const guest = createClient('guest');

  room.onJoin(host, { name: 'Host' });
  room.onJoin(guest, { name: 'Guest' });
  await flushMicrotasks();

  const access = room as unknown as GameRoomAccess;

  access.handleLobbyAction(guest, { type: 'start-game' });
  access.handleTableAction(guest, { type: 'advance-street' });

  assert.equal(guest.errors.length, 2);
  assert.deepEqual(guest.errors[0], {
    code: 4403,
    message: 'start-game: Host only action'
  });
  assert.deepEqual(guest.errors[1], {
    code: 4403,
    message: 'table-action: Host only action'
  });
  assert.equal(access.gameState.phase, 'lobby');
});

test('GameRoom sends private state only to the requested client', async () => {
  const room = new TestGameRoom();
  room.onCreate();
  await flushMicrotasks();

  const access = room as unknown as GameRoomAccess;
  access.gameState = createPlayingState();
  access.syncState();
  await flushMicrotasks();

  const alice = createClient('alice');
  const bob = createClient('bob');

  access.sendPrivateState(alice);
  access.sendPrivateState(bob);

  assert.deepEqual(alice.sent, [
    {
      type: 'private-state',
      message: {
        holeCards: ['AS', 'AH'],
        round: 1,
        street: 'pre-flop'
      }
    }
  ]);
  assert.deepEqual(bob.sent, [
    {
      type: 'private-state',
      message: {
        holeCards: ['KC', 'KD'],
        round: 1,
        street: 'pre-flop'
      }
    }
  ]);
});

test('GameRoom reconnects a dropped player without leaking another player private state', async () => {
  const room = new TestGameRoom();
  room.onCreate();
  await flushMicrotasks();

  const access = room as unknown as GameRoomAccess;
  access.gameState = createPlayingState();
  access.syncState();
  await flushMicrotasks();

  const dropped = createClient('alice');
  const reconnected = createClient('alice');
  room.nextReconnectionClient = reconnected;

  room.onDrop(dropped);
  await flushMicrotasks();
  await flushMicrotasks();

  const alice = access.gameState.players.find((player) => player.id === 'alice');

  assert.equal(alice?.connected, true);
  assert.equal(reconnected.sent.length, 1);
  assert.deepEqual(reconnected.sent[0], {
    type: 'private-state',
    message: {
      holeCards: ['AS', 'AH'],
      round: 1,
      street: 'pre-flop'
    }
  });
  assert.equal(dropped.sent.length, 0);
});

test('createRoomState omits hidden game data', () => {
  const roomState = createRoomState(createPlayingState());

  assert.equal('deck' in roomState, false);
  assert.equal('privateHands' in roomState, false);
});
