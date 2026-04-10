import { randomInt } from 'node:crypto';

export type GamePhase = 'lobby' | 'playing' | 'finished';
export type GameOutcome = 'pending' | 'success' | 'failure';
export type CampaignStatus = 'ongoing' | 'won' | 'lost';
export type TableStreet = 'idle' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';
export type CardSuit = 'S' | 'H' | 'D' | 'C';
export type CardRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type CardCode = `${CardRank}${CardSuit}`;
export type GameRng = () => number;

export interface GamePlayer {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  seat: number;
  holeCardCount: number;
  confidenceRank: number | null;
  actualRank: number | null;
  handLabel: string | null;
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  hostId: string | null;
  maxPlayers: number;
  status: string;
  outcome: GameOutcome;
  campaignStatus: CampaignStatus;
  successfulHands: number;
  failedHands: number;
  targetSuccesses: number;
  maxFailures: number;
  players: GamePlayer[];
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  round: number;
  street: TableStreet;
  dealerSeat: number | null;
  activeSeat: number | null;
  communityCards: CardCode[];
  deck: CardCode[];
  privateHands: Record<string, CardCode[]>;
}

interface HandScore {
  category: number;
  values: number[];
  label: string;
}

const DEFAULT_MAX_PLAYERS = 6;
const DEFAULT_TARGET_SUCCESSES = 3;
const DEFAULT_MAX_FAILURES = 3;
const CARD_SUITS = ['S', 'H', 'D', 'C'] as const;
const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
const RANK_VALUE: Record<CardRank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

function describeLobbyStatus(state: Pick<GameState, 'players'>) {
  if (state.players.length === 0) {
    return 'Waiting for players';
  }

  const readyPlayers = state.players.filter((player) => player.ready).length;

  if (readyPlayers === state.players.length) {
    return 'Ready to start';
  }

  return `${readyPlayers}/${state.players.length} ready`;
}

function describePlayingStatus(street: TableStreet) {
  switch (street) {
    case 'pre-flop':
      return 'Private cards dealt. Study your hand and gauge your confidence.';
    case 'flop':
      return 'Flop revealed. Re-read the table before ranking yourselves.';
    case 'turn':
      return 'Turn card is live. Keep tightening the team order.';
    case 'river':
      return 'River revealed. Finalise your confidence read.';
    case 'showdown':
      return 'Showdown. Lock your confidence order, then resolve the hand.';
    default:
      return 'Waiting for players';
  }
}

function describeFinishedStatus(
  outcome: GameOutcome,
  campaignStatus: CampaignStatus,
  successfulHands: number,
  targetSuccesses: number,
  failedHands: number,
  maxFailures: number,
  tieSuffix = ''
) {
  if (campaignStatus === 'won') {
    return `Hand matched. The crew completed the run at ${successfulHands}/${targetSuccesses} successes.${tieSuffix}`;
  }

  if (campaignStatus === 'lost') {
    return `Hand missed. The alarm track hit ${failedHands}/${maxFailures} failures.${tieSuffix}`;
  }

  if (outcome === 'success') {
    return `Hand matched. Crew progress ${successfulHands}/${targetSuccesses}.${tieSuffix}`;
  }

  if (outcome === 'failure') {
    return `Hand missed. Alarm track ${failedHands}/${maxFailures}.${tieSuffix}`;
  }

  return 'Waiting for players';
}

function createPlayer(base: Pick<GamePlayer, 'id' | 'name' | 'connected'>, seat: number): GamePlayer {
  return {
    ...base,
    ready: false,
    seat,
    holeCardCount: 0,
    confidenceRank: null,
    actualRank: null,
    handLabel: null
  };
}

function reindexPlayers(players: GamePlayer[]) {
  return players.map((player, index) => ({
    ...player,
    seat: index
  }));
}

function resetToLobbyState(state: GameState, players: GamePlayer[]) {
  const lobbyPlayers = reindexPlayers(
    players.map((player) => ({
      ...player,
      ready: false,
      holeCardCount: 0,
      confidenceRank: null,
      actualRank: null,
      handLabel: null
    }))
  );

  return {
    ...state,
    phase: 'lobby' as const,
    hostId: updateHost(state, lobbyPlayers),
    status: describeLobbyStatus({ players: lobbyPlayers }),
    outcome: 'pending' as const,
    campaignStatus: 'ongoing' as const,
    successfulHands: 0,
    failedHands: 0,
    players: lobbyPlayers,
    startedAt: null,
    finishedAt: null,
    round: 0,
    street: 'idle' as const,
    dealerSeat: null,
    activeSeat: null,
    communityCards: [],
    deck: [],
    privateHands: {}
  };
}

function updateHost(state: GameState, players: GamePlayer[]) {
  if (players.length === 0) {
    return null;
  }

  if (state.hostId && players.some((player) => player.id === state.hostId)) {
    return state.hostId;
  }

  return players[0]?.id ?? null;
}

function normalizeTrackedSeat(seat: number | null, players: GamePlayer[]) {
  if (seat === null || players.length === 0) {
    return null;
  }

  return Math.min(seat, players.length - 1);
}

function removePrivateHand(privateHands: Record<string, CardCode[]>, playerId: string) {
  return Object.fromEntries(
    Object.entries(privateHands).filter(([id]) => id !== playerId)
  ) as Record<string, CardCode[]>;
}

function secureRandom() {
  return randomInt(0x100000000) / 0x100000000;
}

function drawCards(deck: CardCode[], count: number) {
  if (deck.length < count) {
    throw new Error('Not enough cards remaining in the deck');
  }

  return {
    cards: deck.slice(0, count),
    deck: deck.slice(count)
  };
}

function combinationIndices(length: number, size: number) {
  const results: number[][] = [];
  const combination: number[] = [];

  function walk(start: number) {
    if (combination.length === size) {
      results.push([...combination]);
      return;
    }

    for (let index = start; index <= length - (size - combination.length); index += 1) {
      combination.push(index);
      walk(index + 1);
      combination.pop();
    }
  }

  walk(0);
  return results;
}

function normalizeCardCode(card: string): CardCode {
  const normalized = card.trim().toUpperCase();
  const match = normalized.match(/^(10|[2-9TJQKA])([SHDC])$/);

  if (!match) {
    throw new Error(`Invalid card code: ${card}`);
  }

  const [, rank, suit] = match;
  return `${rank === '10' ? 'T' : rank}${suit}` as CardCode;
}

function parseCard(card: CardCode) {
  const normalized = normalizeCardCode(card);

  return {
    rank: normalized.slice(0, -1) as CardRank,
    suit: normalized.slice(-1) as CardSuit,
    value: RANK_VALUE[normalized.slice(0, -1) as CardRank]
  };
}

function getStraightHigh(values: number[]) {
  const unique = [...new Set(values)].sort((left, right) => left - right);

  if (unique.includes(14)) {
    unique.unshift(1);
  }

  let run = 1;
  let best: number | null = null;

  for (let index = 1; index < unique.length; index += 1) {
    const current = unique[index]!;
    const previous = unique[index - 1]!;

    if (current === previous + 1) {
      run += 1;
      if (run >= 5) {
        best = current;
      }
    } else {
      run = 1;
    }
  }

  return best;
}

function evaluateFiveCardHand(cards: CardCode[]): HandScore {
  const parsed = cards.map(parseCard);
  const ranks = parsed.map((card) => card.value).sort((left, right) => right - left);
  const suits = parsed.map((card) => card.suit);
  const rankCounts = new Map<number, number>();

  for (const rank of ranks) {
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
  }

  const groups = [...rankCounts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((left, right) => right.count - left.count || right.rank - left.rank);

  const flush = suits.every((suit) => suit === suits[0]);
  const straightHigh = getStraightHigh(ranks);

  if (flush && straightHigh !== null) {
    return {
      category: 8,
      values: [straightHigh],
      label: 'Straight flush'
    };
  }

  if (groups[0]?.count === 4) {
    return {
      category: 7,
      values: [groups[0].rank, groups[1]?.rank ?? 0],
      label: 'Four of a kind'
    };
  }

  if (groups[0]?.count === 3 && groups[1]?.count === 2) {
    return {
      category: 6,
      values: [groups[0].rank, groups[1].rank],
      label: 'Full house'
    };
  }

  if (flush) {
    return {
      category: 5,
      values: ranks,
      label: 'Flush'
    };
  }

  if (straightHigh !== null) {
    return {
      category: 4,
      values: [straightHigh],
      label: 'Straight'
    };
  }

  if (groups[0]?.count === 3) {
    const kickers = groups.slice(1).map((group) => group.rank).sort((left, right) => right - left);
    return {
      category: 3,
      values: [groups[0].rank, ...kickers],
      label: 'Three of a kind'
    };
  }

  if (groups[0]?.count === 2 && groups[1]?.count === 2) {
    const pairRanks = groups
      .filter((group) => group.count === 2)
      .map((group) => group.rank)
      .sort((left, right) => right - left);
    const kicker = groups.find((group) => group.count === 1)?.rank ?? 0;
    return {
      category: 2,
      values: [pairRanks[0] ?? 0, pairRanks[1] ?? 0, kicker],
      label: 'Two pair'
    };
  }

  if (groups[0]?.count === 2) {
    const kickers = groups.slice(1).map((group) => group.rank).sort((left, right) => right - left);
    return {
      category: 1,
      values: [groups[0].rank, ...kickers],
      label: 'One pair'
    };
  }

  return {
    category: 0,
    values: ranks,
    label: 'High card'
  };
}

function compareHandScores(left: HandScore, right: HandScore) {
  if (left.category !== right.category) {
    return left.category - right.category;
  }

  const limit = Math.max(left.values.length, right.values.length);

  for (let index = 0; index < limit; index += 1) {
    const difference = (left.values[index] ?? 0) - (right.values[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function compareShowdownConfidence(left: GamePlayer, right: GamePlayer) {
  return (left.confidenceRank ?? 0) - (right.confidenceRank ?? 0) || left.seat - right.seat;
}

function isShowdownConfidenceOrderCorrect(players: GamePlayer[]) {
  const orderedPlayers = [...players].sort(compareShowdownConfidence);

  return orderedPlayers.every((player, index) => {
    if (player.confidenceRank === null || player.actualRank === null) {
      return false;
    }

    if (index === 0) {
      return true;
    }

    const previous = orderedPlayers[index - 1];
    return (previous?.actualRank ?? 0) <= player.actualRank;
  });
}

function evaluateBestHand(cards: CardCode[]) {
  if (cards.length < 5) {
    throw new Error('At least five cards are required to evaluate a hand');
  }

  let best: HandScore | null = null;

  for (const indices of combinationIndices(cards.length, 5)) {
    const score = evaluateFiveCardHand(indices.map((index) => cards[index]!));

    if (!best || compareHandScores(score, best) > 0) {
      best = score;
    }
  }

  if (!best) {
    throw new Error('Failed to evaluate a best hand');
  }

  return best;
}

function prepareHand(state: GameState, dealerSeat: number | null, rng: GameRng) {
  if (state.players.length < 2) {
    throw new Error('At least two players are required');
  }

  if (!state.players.every((player) => player.connected)) {
    throw new Error('All players must be connected to continue');
  }

  let deck = shuffleDeck(createDeck(), rng);
  const privateHands: Record<string, CardCode[]> = {};

  for (const player of state.players) {
    const deal = drawCards(deck, 2);
    privateHands[player.id] = deal.cards;
    deck = deal.deck;
  }

  const players = state.players.map((player) => ({
    ...player,
    ready: false,
    holeCardCount: privateHands[player.id]?.length ?? 0,
    confidenceRank: null,
    actualRank: null,
    handLabel: null
  }));
  const normalizedDealerSeat = dealerSeat ?? players[0]?.seat ?? null;

  return {
    ...state,
    phase: 'playing' as const,
    startedAt: Date.now(),
    finishedAt: null,
    status: describePlayingStatus('pre-flop'),
    outcome: 'pending' as const,
    players,
    street: 'pre-flop' as const,
    dealerSeat: normalizedDealerSeat,
    activeSeat: normalizedDealerSeat,
    communityCards: [] as CardCode[],
    deck,
    privateHands
  };
}

export function createDeck(): CardCode[] {
  const deck: CardCode[] = [];

  for (const suit of CARD_SUITS) {
    for (const rank of CARD_RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }

  return deck;
}

export function shuffleDeck(cards: readonly CardCode[], rng: GameRng = secureRandom) {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }

  return shuffled;
}

export function createInitialGameState(roomId = '', maxPlayers = DEFAULT_MAX_PLAYERS): GameState {
  return {
    roomId,
    phase: 'lobby',
    hostId: null,
    maxPlayers,
    status: 'Waiting for players',
    outcome: 'pending',
    campaignStatus: 'ongoing',
    successfulHands: 0,
    failedHands: 0,
    targetSuccesses: DEFAULT_TARGET_SUCCESSES,
    maxFailures: DEFAULT_MAX_FAILURES,
    players: [],
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    round: 0,
    street: 'idle',
    dealerSeat: null,
    activeSeat: null,
    communityCards: [],
    deck: [],
    privateHands: {}
  };
}

export function addPlayer(
  state: GameState,
  player: Pick<GamePlayer, 'id' | 'name' | 'connected'>
): GameState {
  if (state.phase !== 'lobby') {
    throw new Error('Game already in progress');
  }

  if (state.players.some((entry) => entry.id === player.id)) {
    return state;
  }

  if (state.players.length >= state.maxPlayers) {
    throw new Error('Room is full');
  }

  const players = reindexPlayers([
    ...state.players,
    createPlayer(player, state.players.length)
  ]);

  return {
    ...state,
    hostId: state.hostId ?? player.id,
    players,
    status: describeLobbyStatus({ players })
  };
}

export function removePlayer(state: GameState, playerId: string): GameState {
  const players = reindexPlayers(state.players.filter((player) => player.id !== playerId));

  if (state.phase !== 'lobby' && players.length < 2) {
    return resetToLobbyState(state, players);
  }

  return {
    ...state,
    hostId: updateHost(state, players),
    players,
    privateHands: removePrivateHand(state.privateHands, playerId),
    dealerSeat: normalizeTrackedSeat(state.dealerSeat, players),
    activeSeat: normalizeTrackedSeat(state.activeSeat, players),
    status: state.phase === 'lobby' ? describeLobbyStatus({ players }) : state.status
  };
}

export function setPlayerConnected(state: GameState, playerId: string, connected: boolean): GameState {
  const players = reindexPlayers(
    state.players.map((player) =>
      player.id === playerId ? { ...player, connected } : player
    )
  );

  return {
    ...state,
    players,
    status: state.phase === 'lobby' ? describeLobbyStatus({ players }) : state.status
  };
}

export function setPlayerReady(state: GameState, playerId: string, ready: boolean): GameState {
  if (state.phase !== 'lobby') {
    return state;
  }

  const players = reindexPlayers(
    state.players.map((player) =>
      player.id === playerId ? { ...player, ready } : player
    )
  );

  return {
    ...state,
    players,
    status: describeLobbyStatus({ players })
  };
}

export function setPlayerName(state: GameState, playerId: string, name: string): GameState {
  if (state.phase !== 'lobby') {
    throw new Error('Names can only be changed in the lobby');
  }

  const normalized = name.trim();

  if (!normalized) {
    throw new Error('Name cannot be empty');
  }

  const players = reindexPlayers(
    state.players.map((player) =>
      player.id === playerId ? { ...player, name: normalized } : player
    )
  );

  return {
    ...state,
    players
  };
}

export function setPlayerConfidence(state: GameState, playerId: string, confidenceRank: number | null): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  if (confidenceRank !== null && (!Number.isInteger(confidenceRank) || confidenceRank < 1 || confidenceRank > state.players.length)) {
    throw new Error('Confidence slot is out of range');
  }

  const owner =
    confidenceRank === null
      ? null
      : state.players.find((player) => player.id !== playerId && player.confidenceRank === confidenceRank);

  if (owner) {
    throw new Error('Confidence slot already taken');
  }

  const players = reindexPlayers(
    state.players.map((player) =>
      player.id === playerId ? { ...player, confidenceRank } : player
    )
  );

  return {
    ...state,
    players
  };
}

export function canStartGame(state: GameState) {
  return (
    state.phase === 'lobby' &&
    state.players.length >= 2 &&
    state.players.every((player) => player.connected) &&
    state.players.every((player) => player.ready)
  );
}

export function startGame(state: GameState, rng: GameRng = secureRandom): GameState {
  if (!canStartGame(state)) {
    throw new Error('Game cannot start yet');
  }

  return prepareHand(
    {
      ...state,
      round: 1,
      outcome: 'pending',
      campaignStatus: 'ongoing'
    },
    state.players[0]?.seat ?? null,
    rng
  );
}

export function advanceStreet(state: GameState): GameState {
  if (state.phase !== 'playing') {
    throw new Error('Game is not currently running');
  }

  if (state.street === 'showdown') {
    throw new Error('Hand is already at showdown');
  }

  let street: TableStreet = state.street;
  let communityCards = state.communityCards;
  let deck = state.deck;

  if (state.street === 'pre-flop') {
    const reveal = drawCards(deck, 3);
    street = 'flop';
    communityCards = [...communityCards, ...reveal.cards];
    deck = reveal.deck;
  } else if (state.street === 'flop') {
    const reveal = drawCards(deck, 1);
    street = 'turn';
    communityCards = [...communityCards, ...reveal.cards];
    deck = reveal.deck;
  } else if (state.street === 'turn') {
    const reveal = drawCards(deck, 1);
    street = 'river';
    communityCards = [...communityCards, ...reveal.cards];
    deck = reveal.deck;
  } else if (state.street === 'river') {
    street = 'showdown';
  }

  return {
    ...state,
    street,
    communityCards,
    deck,
    activeSeat: street === 'showdown' ? null : state.activeSeat,
    status: describePlayingStatus(street)
  };
}

export function canResolveShowdown(state: GameState) {
  return (
    state.phase === 'playing' &&
    state.street === 'showdown' &&
    state.players.length >= 2 &&
    state.players.every((player) => player.confidenceRank !== null)
  );
}

export function resolveShowdown(state: GameState): GameState {
  if (!canResolveShowdown(state)) {
    throw new Error('Showdown cannot be resolved yet');
  }

  const ranking = state.players
    .map((player) => ({
      playerId: player.id,
      seat: player.seat,
      score: evaluateBestHand([...getPlayerHand(state, player.id), ...state.communityCards])
    }))
    .sort((left, right) => compareHandScores(right.score, left.score) || left.seat - right.seat);

  const hadTie = ranking.some((entry, index) => {
    const previous = ranking[index - 1];
    return previous ? compareHandScores(entry.score, previous.score) === 0 : false;
  });

  const actualRankByPlayerId = new Map<string, number>();
  let actualRank = 0;

  ranking.forEach((entry, index) => {
    const previous = ranking[index - 1];

    if (index === 0 || (previous && compareHandScores(entry.score, previous.score) !== 0)) {
      actualRank += 1;
    }

    actualRankByPlayerId.set(entry.playerId, actualRank);
  });

  const players = reindexPlayers(
    state.players.map((player) => {
      const ranked = ranking.find((entry) => entry.playerId === player.id);

      return {
        ...player,
        actualRank: actualRankByPlayerId.get(player.id) ?? null,
        handLabel: ranked?.score.label ?? null
      };
    })
  );

  const outcome = isShowdownConfidenceOrderCorrect(players) ? 'success' : 'failure';
  const successfulHands = state.successfulHands + (outcome === 'success' ? 1 : 0);
  const failedHands = state.failedHands + (outcome === 'failure' ? 1 : 0);
  const campaignStatus: CampaignStatus =
    successfulHands >= state.targetSuccesses
      ? 'won'
      : failedHands >= state.maxFailures
        ? 'lost'
        : 'ongoing';
  const tieSuffix = hadTie ? ' Ties are grouped together in this MVP.' : '';

  return {
    ...state,
    phase: 'finished',
    finishedAt: Date.now(),
    activeSeat: null,
    outcome,
    campaignStatus,
    successfulHands,
    failedHands,
    players,
    status: describeFinishedStatus(
      outcome,
      campaignStatus,
      successfulHands,
      state.targetSuccesses,
      failedHands,
      state.maxFailures,
      tieSuffix
    )
  };
}

export function canStartNextHand(state: GameState) {
  return (
    state.phase === 'finished' &&
    state.campaignStatus === 'ongoing' &&
    state.players.length >= 2 &&
    state.players.every((player) => player.connected)
  );
}

export function startNextHand(state: GameState, rng: GameRng = secureRandom): GameState {
  if (!canStartNextHand(state)) {
    throw new Error('Next hand cannot start yet');
  }

  const dealerSeat =
    state.dealerSeat === null
      ? state.players[0]?.seat ?? null
      : (state.dealerSeat + 1) % state.players.length;

  return prepareHand(
    {
      ...state,
      round: state.round + 1,
      outcome: 'pending',
      finishedAt: null
    },
    dealerSeat,
    rng
  );
}

export function restartCampaign(state: GameState): GameState {
  if (state.players.length < 2) {
    throw new Error('At least two players are required to restart');
  }

  return resetToLobbyState(state, state.players);
}

export function getPlayerHand(state: GameState, playerId: string): CardCode[] {
  return [...(state.privateHands[playerId] ?? [])];
}

export function finishGame(state: GameState, winnerId: string | null = null): GameState {
  return {
    ...state,
    phase: 'finished',
    finishedAt: Date.now(),
    street: 'showdown',
    activeSeat: null,
    outcome: winnerId ? 'success' : state.outcome,
    campaignStatus: winnerId ? 'won' : state.campaignStatus,
    status: winnerId ? `Winner: ${winnerId}` : 'Game finished'
  };
}
