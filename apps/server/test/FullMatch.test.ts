import assert from 'node:assert/strict';
import test from 'node:test';

import { type Client } from 'colyseus';

import { resolveShowdown, type GameState } from '@booger/game';

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
  handleLobbyAction(client: Client, message: { type: 'set-ready'; ready?: boolean }): void;
  handleTableAction(
    client: Client,
    message:
      | { type: 'advance-street' | 'resolve-showdown' | 'restart-run' | 'next-hand' | 'sync-private-state' }
      | { type: 'set-confidence'; confidenceRank?: number | null }
  ): void;
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
  override async lock() {
    // no-op for tests
  }

  override async unlock() {
    // no-op for tests
  }
}

function sortPlayersStrongestFirst(players: GameState['players']) {
  return [...players].sort((left, right) => {
    if ((left.actualRank ?? Number.MAX_SAFE_INTEGER) !== (right.actualRank ?? Number.MAX_SAFE_INTEGER)) {
      return (left.actualRank ?? Number.MAX_SAFE_INTEGER) - (right.actualRank ?? Number.MAX_SAFE_INTEGER);
    }

    return left.seat - right.seat;
  });
}

test('GameRoom supports a full 4-player successful campaign across multiple hands', async () => {
  const room = new TestGameRoom();
  room.onCreate();
  await flushMicrotasks();

  const access = room as unknown as GameRoomAccess;
  const clients = ['host', 'alice', 'bob', 'carol'].map(createClient);

  for (const client of clients) {
    room.onJoin(client, { name: client.sessionId });
  }

  await flushMicrotasks();

  for (const client of clients) {
    access.handleLobbyAction(client, { type: 'set-ready', ready: true });
  }

  await flushMicrotasks();

  assert.equal(access.gameState.phase, 'playing');
  assert.equal(access.gameState.round, 1);
  assert.equal(access.gameState.players.length, 4);

  let completedHands = 0;

  while (access.gameState.campaignStatus === 'ongoing') {
    const host = clients[0]!;

    while (access.gameState.street !== 'showdown') {
      access.handleTableAction(host, { type: 'advance-street' });
    }

    const projected = resolveShowdown({
      ...access.gameState,
      players: access.gameState.players.map((player, index) => ({
        ...player,
        confidenceRank: index + 1
      }))
    });
    const ordered = sortPlayersStrongestFirst(projected.players);

    ordered.forEach((player, index) => {
      const client = clients.find((entry) => entry.sessionId === player.id);
      assert.ok(client, `Missing client for ${player.id}`);
      access.handleTableAction(client, {
        type: 'set-confidence',
        confidenceRank: index + 1
      });
    });

    access.handleTableAction(host, { type: 'resolve-showdown' });

    assert.equal(access.gameState.phase, 'finished');
    assert.equal(access.gameState.outcome, 'success');
    completedHands += 1;

    if (access.gameState.campaignStatus === 'ongoing') {
      access.handleTableAction(host, { type: 'next-hand' });
      assert.equal(access.gameState.phase, 'playing');
      assert.equal(access.gameState.round, completedHands + 1);
    }
  }

  assert.equal(completedHands, access.gameState.targetSuccesses);
  assert.equal(access.gameState.campaignStatus, 'won');
  assert.equal(access.gameState.successfulHands, access.gameState.targetSuccesses);
  assert.equal(access.gameState.failedHands, 0);
  assert.equal(access.gameState.round, access.gameState.targetSuccesses);

  for (const client of clients) {
    assert.deepEqual(client.errors, []);
  }
});
