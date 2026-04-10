import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addPlayer,
  advanceStreet,
  canResolveShowdown,
  canStartGame,
  canStartNextHand,
  createDeck,
  createInitialGameState,
  finishGame,
  getPlayerHand,
  restartCampaign,
  setPlayerConfidence,
  setPlayerConnected,
  setPlayerReady,
  startGame,
  startNextHand,
  type GameState
} from '../src/index.ts';

function createLobbyState(playerIds = ['alice', 'bob']) {
  let state = createInitialGameState('flow-room', playerIds.length);

  for (const playerId of playerIds) {
    state = addPlayer(state, {
      id: playerId,
      name: playerId,
      connected: true
    });
  }

  return state;
}

function createReadyLobbyState(playerIds = ['alice', 'bob']) {
  let state = createLobbyState(playerIds);

  for (const playerId of playerIds) {
    state = setPlayerReady(state, playerId, true);
  }

  return state;
}

test('createDeck returns 52 unique cards', () => {
  const deck = createDeck();

  assert.equal(deck.length, 52);
  assert.equal(new Set(deck).size, 52);
});

test('addPlayer assigns the first host and enforces max players', () => {
  let state = createInitialGameState('cap-room', 2);
  state = addPlayer(state, { id: 'alice', name: 'Alice', connected: true });
  state = addPlayer(state, { id: 'bob', name: 'Bob', connected: true });

  assert.equal(state.hostId, 'alice');
  assert.throws(() => addPlayer(state, { id: 'carol', name: 'Carol', connected: true }), /Room is full/);
});

test('addPlayer rejects joins once a game is in progress', () => {
  const started = startGame(createReadyLobbyState(), () => 0.2);

  assert.throws(
    () => addPlayer(started, { id: 'carol', name: 'Carol', connected: true }),
    /Game already in progress/
  );
});

test('canStartGame requires all connected players to be ready', () => {
  let state = createLobbyState(['alice', 'bob', 'carol']);
  state = setPlayerReady(state, 'alice', true);
  state = setPlayerReady(state, 'bob', true);
  state = setPlayerReady(state, 'carol', true);

  assert.equal(canStartGame(state), true);

  state = setPlayerConnected(state, 'carol', false);
  assert.equal(canStartGame(state), false);

  state = setPlayerConnected(state, 'carol', true);
  state = setPlayerReady(state, 'carol', false);
  assert.equal(canStartGame(state), false);
});

test('startGame deals unique private cards to each player', () => {
  const state = startGame(createReadyLobbyState(['alice', 'bob', 'carol', 'dave']), () => 0.4);
  const dealtCards = Object.values(state.privateHands).flat();

  assert.equal(dealtCards.length, 8);
  assert.equal(new Set(dealtCards).size, 8);
});

test('advanceStreet reveals 3, then 1, then 1 community cards before showdown', () => {
  let state = startGame(createReadyLobbyState(), () => 0.3);

  state = advanceStreet(state);
  assert.equal(state.street, 'flop');
  assert.equal(state.communityCards.length, 3);

  state = advanceStreet(state);
  assert.equal(state.street, 'turn');
  assert.equal(state.communityCards.length, 4);

  state = advanceStreet(state);
  assert.equal(state.street, 'river');
  assert.equal(state.communityCards.length, 5);

  state = advanceStreet(state);
  assert.equal(state.street, 'showdown');
  assert.equal(state.communityCards.length, 5);

  assert.throws(() => advanceStreet(state), /already at showdown/);
});

test('setPlayerConfidence enforces range and allows clearing a slot', () => {
  let state = startGame(createReadyLobbyState(), () => 0.1);

  assert.throws(() => setPlayerConfidence(state, 'alice', 0), /out of range/);
  assert.throws(() => setPlayerConfidence(state, 'alice', 3), /out of range/);

  state = setPlayerConfidence(state, 'alice', 1);
  state = setPlayerConfidence(state, 'alice', null);
  state = setPlayerConfidence(state, 'bob', 1);

  const bob = state.players.find((player) => player.id === 'bob');
  assert.equal(bob?.confidenceRank, 1);
});

test('canResolveShowdown remains false until every player has chosen a confidence slot', () => {
  let state = startGame(createReadyLobbyState(['alice', 'bob', 'carol']), () => 0.1);

  state = advanceStreet(state);
  state = advanceStreet(state);
  state = advanceStreet(state);
  state = advanceStreet(state);

  assert.equal(state.street, 'showdown');
  assert.equal(canResolveShowdown(state), false);

  state = setPlayerConfidence(state, 'alice', 1);
  state = setPlayerConfidence(state, 'bob', 2);
  assert.equal(canResolveShowdown(state), false);

  state = setPlayerConfidence(state, 'carol', 3);
  assert.equal(canResolveShowdown(state), true);
});

test('canStartNextHand requires an ongoing campaign and all players connected', () => {
  let finished: GameState = {
    ...createLobbyState(['alice', 'bob']),
    phase: 'finished',
    campaignStatus: 'ongoing',
    outcome: 'success',
    round: 1,
    dealerSeat: 0,
    players: createLobbyState(['alice', 'bob']).players
  };

  assert.equal(canStartNextHand(finished), true);

  finished = setPlayerConnected(finished, 'bob', false);
  assert.equal(canStartNextHand(finished), false);

  finished = setPlayerConnected(finished, 'bob', true);
  finished = { ...finished, campaignStatus: 'won' };
  assert.equal(canStartNextHand(finished), false);
});

test('getPlayerHand returns a defensive copy', () => {
  const state = startGame(createReadyLobbyState(), () => 0.2);
  const hand = getPlayerHand(state, 'alice');

  hand.push('AS');

  assert.equal(getPlayerHand(state, 'alice').length, 2);
});

test('finishGame marks the game as finished and can declare a winner', () => {
  const finished = finishGame(startGame(createReadyLobbyState(), () => 0.2), 'alice');

  assert.equal(finished.phase, 'finished');
  assert.equal(finished.street, 'showdown');
  assert.equal(finished.campaignStatus, 'won');
  assert.match(finished.status, /Winner: alice/);
});

test('restartCampaign and startNextHand enforce their preconditions', () => {
  assert.throws(() => restartCampaign(createLobbyState(['solo'])), /At least two players/);
  assert.throws(() => startNextHand(createInitialGameState('fresh-room')), /Next hand cannot start yet/);
});
