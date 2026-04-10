import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addPlayer,
  canResolveShowdown,
  createInitialGameState,
  resolveShowdown,
  type CardCode,
  type GameState
} from '../src/index.ts';

type ShowdownSetup = {
  board: CardCode[];
  hands: Record<string, CardCode[]>;
  confidence: Record<string, number>;
};

function createShowdownState(playerIds: string[], setup: ShowdownSetup): GameState {
  let state = createInitialGameState('showdown-test', playerIds.length);

  for (const playerId of playerIds) {
    state = addPlayer(state, {
      id: playerId,
      name: playerId,
      connected: true
    });
  }

  return {
    ...state,
    phase: 'playing',
    street: 'showdown',
    round: 1,
    communityCards: setup.board,
    privateHands: setup.hands,
    players: state.players.map((player) => ({
      ...player,
      holeCardCount: 2,
      confidenceRank: setup.confidence[player.id] ?? null
    }))
  };
}

function resolveHeadsUp(
  board: CardCode[],
  strongerHand: CardCode[],
  weakerHand: CardCode[],
  strongerId = 'stronger',
  weakerId = 'weaker'
) {
  const state = createShowdownState([strongerId, weakerId], {
    board,
    hands: {
      [strongerId]: strongerHand,
      [weakerId]: weakerHand
    },
    confidence: {
      [strongerId]: 1,
      [weakerId]: 2
    }
  });

  assert.equal(canResolveShowdown(state), true);

  const resolved = resolveShowdown(state);
  const stronger = resolved.players.find((player) => player.id === strongerId);
  const weaker = resolved.players.find((player) => player.id === weakerId);

  assert.ok(stronger);
  assert.ok(weaker);

  return { resolved, stronger, weaker };
}

test('showdown evaluator ranks high card over a lower high card', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['AS', 'KD', '9C', '5H', '2S'],
    ['QH', 'JC'],
    ['QD', 'TC']
  );

  assert.equal(stronger.handLabel, 'High card');
  assert.equal(stronger.actualRank, 1);
  assert.equal(weaker.handLabel, 'High card');
  assert.equal(weaker.actualRank, 2);
});

test('showdown evaluator ranks one pair over high card', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['AS', 'KD', '9C', '5H', '2S'],
    ['QH', 'QS'],
    ['JD', 'TC']
  );

  assert.equal(stronger.handLabel, 'One pair');
  assert.equal(weaker.handLabel, 'High card');
});

test('showdown evaluator ranks two pair over one pair', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['AS', 'KD', '9C', '5H', '2S'],
    ['KC', '5C'],
    ['QH', 'QS']
  );

  assert.equal(stronger.handLabel, 'Two pair');
  assert.equal(weaker.handLabel, 'One pair');
});

test('showdown evaluator ranks three of a kind over two pair', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['KD', '9C', '5H', '2S', '3D'],
    ['KC', 'KH'],
    ['5C', '2C']
  );

  assert.equal(stronger.handLabel, 'Three of a kind');
  assert.equal(weaker.handLabel, 'Two pair');
});

test('showdown evaluator ranks a straight over three of a kind', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['9S', '8D', '7C', '2H', 'KD'],
    ['6H', '5S'],
    ['KC', 'KH']
  );

  assert.equal(stronger.handLabel, 'Straight');
  assert.equal(weaker.handLabel, 'Three of a kind');
});

test('showdown evaluator recognizes the wheel straight', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['4S', '3D', '2C', '9H', 'KD'],
    ['AH', '5S'],
    ['KC', 'KH']
  );

  assert.equal(stronger.handLabel, 'Straight');
  assert.equal(stronger.actualRank, 1);
  assert.equal(weaker.handLabel, 'Three of a kind');
});

test('showdown evaluator ranks a flush over a straight', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['9S', '8S', '7D', '2S', 'KS'],
    ['AS', '3H'],
    ['6H', '5C']
  );

  assert.equal(stronger.handLabel, 'Flush');
  assert.equal(weaker.handLabel, 'Straight');
});

test('showdown evaluator ranks a full house over a flush', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['AS', 'AH', '5S', '5D', 'QS'],
    ['QC', 'QH'],
    ['KS', '3S']
  );

  assert.equal(stronger.handLabel, 'Full house');
  assert.equal(weaker.handLabel, 'Flush');
});

test('showdown evaluator ranks four of a kind over a full house', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['AS', 'AH', 'AD', '5D', 'KD'],
    ['AC', 'KH'],
    ['KC', 'KS']
  );

  assert.equal(stronger.handLabel, 'Four of a kind');
  assert.equal(weaker.handLabel, 'Full house');
});

test('showdown evaluator ranks a straight flush over four of a kind', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['9S', '8S', '7S', '2D', 'KD'],
    ['6S', '5S'],
    ['AC', 'AH']
  );

  assert.equal(stronger.handLabel, 'Straight flush');
  assert.equal(weaker.handLabel, 'One pair');
});

test('showdown evaluator breaks ties for one pair by kickers', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['QH', '9D', '5C', '2S', 'AS'],
    ['QS', 'KC'],
    ['QD', 'JC']
  );

  assert.equal(stronger.handLabel, 'One pair');
  assert.equal(weaker.handLabel, 'One pair');
  assert.equal(stronger.actualRank, 1);
  assert.equal(weaker.actualRank, 2);
});

test('showdown evaluator breaks ties for two pair by kicker', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['KH', 'KD', '5C', '5D', '2S'],
    ['AH', '9C'],
    ['QH', '9D']
  );

  assert.equal(stronger.handLabel, 'Two pair');
  assert.equal(weaker.handLabel, 'Two pair');
  assert.equal(stronger.actualRank, 1);
  assert.equal(weaker.actualRank, 2);
});

test('showdown evaluator breaks ties for flushes lexicographically', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['AS', '9S', '5S', '2S', 'KD'],
    ['QS', '3H'],
    ['JS', '4H']
  );

  assert.equal(stronger.handLabel, 'Flush');
  assert.equal(weaker.handLabel, 'Flush');
  assert.equal(stronger.actualRank, 1);
  assert.equal(weaker.actualRank, 2);
});

test('showdown evaluator breaks ties for full houses by trip rank', () => {
  const { stronger, weaker } = resolveHeadsUp(
    ['AS', 'AH', '5S', '5D', 'KD'],
    ['KC', 'KH'],
    ['5C', '2H']
  );

  assert.equal(stronger.handLabel, 'Full house');
  assert.equal(weaker.handLabel, 'Full house');
  assert.equal(stronger.actualRank, 1);
  assert.equal(weaker.actualRank, 2);
});

test('showdown evaluator groups exact board ties into the same rank', () => {
  const state = createShowdownState(['alice', 'bob'], {
    board: ['AS', 'KD', 'QC', 'JH', '9S'],
    hands: {
      alice: ['4H', '3C'],
      bob: ['4D', '3D']
    },
    confidence: {
      alice: 1,
      bob: 2
    }
  });

  const resolved = resolveShowdown(state);
  const alice = resolved.players.find((player) => player.id === 'alice');
  const bob = resolved.players.find((player) => player.id === 'bob');

  assert.equal(resolved.outcome, 'success');
  assert.equal(alice?.handLabel, 'High card');
  assert.equal(bob?.handLabel, 'High card');
  assert.equal(alice?.actualRank, 1);
  assert.equal(bob?.actualRank, 1);
});
