import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addPlayer,
  canResolveShowdown,
  createInitialGameState,
  removePlayer,
  resolveShowdown,
  restartCampaign,
  setPlayerConfidence,
  setPlayerReady,
  shuffleDeck,
  startGame,
  startNextHand
} from '../src/index.ts';

function createLobbyState() {
  let state = createInitialGameState('room-1', 6);
  state = addPlayer(state, { id: 'alice', name: 'Alice', connected: true });
  state = addPlayer(state, { id: 'bob', name: 'Bob', connected: true });
  state = setPlayerReady(state, 'alice', true);
  state = setPlayerReady(state, 'bob', true);
  return state;
}

test('shuffleDeck uses the provided RNG for deterministic ordering', () => {
  const shuffled = shuffleDeck(['AS', 'KH', 'QD'], () => 0);

  assert.deepEqual(shuffled, ['KH', 'QD', 'AS']);
});

test('startGame deals two cards to each player and enters playing phase', () => {
  const state = startGame(createLobbyState(), () => 0.25);

  assert.equal(state.phase, 'playing');
  assert.equal(state.street, 'pre-flop');
  assert.equal(state.round, 1);
  assert.equal(state.communityCards.length, 0);
  assert.equal(state.players.length, 2);
  assert.deepEqual(
    state.players.map((player) => player.holeCardCount),
    [2, 2]
  );
  assert.deepEqual(
    state.players.map((player) => player.ready),
    [false, false]
  );
  assert.equal(state.privateHands.alice.length, 2);
  assert.equal(state.privateHands.bob.length, 2);
});

test('setPlayerConfidence rejects a slot that is already taken', () => {
  let state = startGame(createLobbyState(), () => 0.1);
  state = setPlayerConfidence(state, 'alice', 1);

  assert.throws(() => setPlayerConfidence(state, 'bob', 1), /already taken/);
});

test('resolveShowdown assigns actual ranks strongest-first and marks a failed read when slots are reversed', () => {
  let state = createInitialGameState('showdown-room', 6);
  state = addPlayer(state, { id: 'alice', name: 'Alice', connected: true });
  state = addPlayer(state, { id: 'bob', name: 'Bob', connected: true });
  state = {
    ...state,
    phase: 'playing',
    street: 'showdown',
    round: 1,
    communityCards: ['2H', '2D', '7S', '9C', 'KD'],
    privateHands: {
      alice: ['AS', 'AH'],
      bob: ['3C', '4C']
    },
    players: state.players.map((player) => ({
      ...player,
      holeCardCount: 2,
      confidenceRank: player.id === 'alice' ? 2 : 1
    }))
  };

  assert.equal(canResolveShowdown(state), true);

  const resolved = resolveShowdown(state);
  const alice = resolved.players.find((player) => player.id === 'alice');
  const bob = resolved.players.find((player) => player.id === 'bob');

  assert.equal(resolved.phase, 'finished');
  assert.equal(resolved.outcome, 'failure');
  assert.equal(resolved.failedHands, 1);
  assert.equal(resolved.successfulHands, 0);
  assert.equal(alice?.actualRank, 1);
  assert.equal(bob?.actualRank, 2);
  assert.equal(alice?.handLabel, 'Two pair');
  assert.equal(bob?.handLabel, 'One pair');
});

test('resolveShowdown keeps tied hands in the same strongest-first rank group', () => {
  let state = createInitialGameState('tie-room', 6);
  state = addPlayer(state, { id: 'alice', name: 'Alice', connected: true });
  state = addPlayer(state, { id: 'bob', name: 'Bob', connected: true });
  state = addPlayer(state, { id: 'carol', name: 'Carol', connected: true });
  state = {
    ...state,
    phase: 'playing',
    street: 'showdown',
    round: 1,
    communityCards: ['2H', '2D', '7S', '9C', 'KD'],
    privateHands: {
      alice: ['AS', 'AH'],
      bob: ['AC', 'AD'],
      carol: ['3C', '4C']
    },
    players: state.players.map((player) => ({
      ...player,
      holeCardCount: 2,
      confidenceRank:
        player.id === 'alice' ? 1 : player.id === 'bob' ? 2 : 3
    }))
  };

  assert.equal(canResolveShowdown(state), true);

  const resolved = resolveShowdown(state);
  const alice = resolved.players.find((player) => player.id === 'alice');
  const bob = resolved.players.find((player) => player.id === 'bob');
  const carol = resolved.players.find((player) => player.id === 'carol');

  assert.equal(resolved.phase, 'finished');
  assert.equal(resolved.outcome, 'success');
  assert.equal(resolved.successfulHands, 1);
  assert.equal(resolved.failedHands, 0);
  assert.equal(alice?.actualRank, 1);
  assert.equal(bob?.actualRank, 1);
  assert.equal(carol?.actualRank, 2);
  assert.equal(alice?.handLabel, 'Two pair');
  assert.equal(bob?.handLabel, 'Two pair');
  assert.equal(carol?.handLabel, 'One pair');
});

test('resolveShowdown accepts 10-rank shorthand when evaluating hands', () => {
  let state = createInitialGameState('ten-shorthand-room', 6);
  state = addPlayer(state, { id: 'alice', name: 'Alice', connected: true });
  state = addPlayer(state, { id: 'bob', name: 'Bob', connected: true });
  state = {
    ...state,
    phase: 'playing',
    street: 'showdown',
    round: 1,
    communityCards: ['10c', 'jc', 'qc', 'kc', '2d'],
    privateHands: {
      alice: ['ac', '3s'],
      bob: ['7d', '4d']
    },
    players: state.players.map((player) => ({
      ...player,
      holeCardCount: 2,
      confidenceRank: player.id === 'alice' ? 1 : 2
    }))
  };

  assert.equal(canResolveShowdown(state), true);

  const resolved = resolveShowdown(state);
  const alice = resolved.players.find((player) => player.id === 'alice');
  const bob = resolved.players.find((player) => player.id === 'bob');

  assert.equal(resolved.phase, 'finished');
  assert.equal(resolved.outcome, 'success');
  assert.equal(alice?.actualRank, 1);
  assert.equal(alice?.handLabel, 'Straight flush');
  assert.equal(bob?.actualRank, 2);
  assert.equal(bob?.handLabel, 'High card');
});

test('resolveShowdown ranks player 2 above player 1 for two pair over one pair', () => {
  let state = createInitialGameState('player-order-room', 6);
  state = addPlayer(state, { id: 'player-1', name: 'Player 1', connected: true });
  state = addPlayer(state, { id: 'player-2', name: 'Player 2', connected: true });
  state = {
    ...state,
    phase: 'playing',
    street: 'showdown',
    round: 1,
    communityCards: ['JS', '3C', '2H', 'QC', 'JH'],
    privateHands: {
      'player-1': ['8C', '6D'],
      'player-2': ['8H', 'QH']
    },
    players: state.players.map((player) => ({
      ...player,
      holeCardCount: 2,
      confidenceRank: player.id === 'player-2' ? 1 : 2
    }))
  };

  const resolved = resolveShowdown(state);
  const player1 = resolved.players.find((player) => player.id === 'player-1');
  const player2 = resolved.players.find((player) => player.id === 'player-2');

  assert.equal(resolved.outcome, 'success');
  assert.equal(player1?.actualRank, 2);
  assert.equal(player1?.handLabel, 'One pair');
  assert.equal(player2?.actualRank, 1);
  assert.equal(player2?.handLabel, 'Two pair');
});

test('removePlayer resets an in-progress game to lobby when too few players remain', () => {
  let state = startGame(createLobbyState(), () => 0.4);
  state = removePlayer(state, 'bob');

  assert.equal(state.phase, 'lobby');
  assert.equal(state.round, 0);
  assert.equal(state.street, 'idle');
  assert.equal(state.successfulHands, 0);
  assert.equal(state.failedHands, 0);
  assert.equal(state.players.length, 1);
  assert.equal(state.players[0]?.id, 'alice');
  assert.equal(state.players[0]?.ready, false);
  assert.equal(state.players[0]?.holeCardCount, 0);
  assert.equal(state.hostId, 'alice');
});

test('startNextHand rotates the dealer, clears prior showdown markers, and keeps the campaign running', () => {
  let finished = createInitialGameState('next-hand-room', 6);
  finished = addPlayer(finished, { id: 'alice', name: 'Alice', connected: true });
  finished = addPlayer(finished, { id: 'bob', name: 'Bob', connected: true });
  finished = {
    ...finished,
    phase: 'finished',
    outcome: 'failure',
    campaignStatus: 'ongoing',
    failedHands: 1,
    successfulHands: 0,
    round: 1,
    dealerSeat: 0,
    communityCards: ['2H', '3D', '4S', '5C', '6H'],
    privateHands: {
      alice: ['AS', 'KD'],
      bob: ['QC', 'JH']
    },
    players: finished.players.map((player, index) => ({
      ...player,
      holeCardCount: 2,
      confidenceRank: index + 1,
      actualRank: 2 - index,
      handLabel: index === 0 ? 'Straight' : 'High card'
    }))
  };

  const next = startNextHand(finished, () => 0.6);

  assert.equal(next.phase, 'playing');
  assert.equal(next.round, 2);
  assert.equal(next.dealerSeat, 1);
  assert.equal(next.outcome, 'pending');
  assert.equal(next.failedHands, 1);
  assert.equal(next.successfulHands, 0);
  assert.deepEqual(
    next.players.map((player) => ({
      confidenceRank: player.confidenceRank,
      actualRank: player.actualRank,
      handLabel: player.handLabel,
      holeCardCount: player.holeCardCount
    })),
    [
      { confidenceRank: null, actualRank: null, handLabel: null, holeCardCount: 2 },
      { confidenceRank: null, actualRank: null, handLabel: null, holeCardCount: 2 }
    ]
  );
});

test('restartCampaign returns the room to lobby and clears run progress', () => {
  let state = createInitialGameState('restart-room', 6);
  state = addPlayer(state, { id: 'alice', name: 'Alice', connected: true });
  state = addPlayer(state, { id: 'bob', name: 'Bob', connected: true });
  state = {
    ...state,
    phase: 'finished',
    outcome: 'failure',
    campaignStatus: 'lost',
    successfulHands: 1,
    failedHands: 3,
    round: 4,
    street: 'showdown',
    dealerSeat: 1,
    activeSeat: null,
    communityCards: ['2H', '3H', '4H', '5H', '6H'],
    privateHands: {
      alice: ['AS', 'AH'],
      bob: ['KC', 'KD']
    },
    players: state.players.map((player, index) => ({
      ...player,
      holeCardCount: 2,
      confidenceRank: index + 1,
      actualRank: index + 1,
      handLabel: 'Flush'
    }))
  };

  const restarted = restartCampaign(state);

  assert.equal(restarted.phase, 'lobby');
  assert.equal(restarted.campaignStatus, 'ongoing');
  assert.equal(restarted.successfulHands, 0);
  assert.equal(restarted.failedHands, 0);
  assert.equal(restarted.round, 0);
  assert.equal(restarted.street, 'idle');
  assert.deepEqual(restarted.communityCards, []);
  assert.deepEqual(restarted.privateHands, {});
  assert.deepEqual(
    restarted.players.map((player) => ({
      ready: player.ready,
      holeCardCount: player.holeCardCount,
      confidenceRank: player.confidenceRank,
      actualRank: player.actualRank,
      handLabel: player.handLabel
    })),
    [
      { ready: false, holeCardCount: 0, confidenceRank: null, actualRank: null, handLabel: null },
      { ready: false, holeCardCount: 0, confidenceRank: null, actualRank: null, handLabel: null }
    ]
  );
});
