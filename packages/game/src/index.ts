export type GamePhase = 'lobby' | 'playing' | 'finished';
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
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  hostId: string | null;
  maxPlayers: number;
  status: string;
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

const DEFAULT_MAX_PLAYERS = 6;
const CARD_SUITS = ['S', 'H', 'D', 'C'] as const;
const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

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
      return 'Showdown. Compare confidence and prepare to score the hand.';
    default:
      return 'Waiting for players';
  }
}

function reindexPlayers(players: GamePlayer[]) {
  return players.map((player, index) => ({
    ...player,
    seat: index
  }));
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

function drawCards(deck: CardCode[], count: number) {
  if (deck.length < count) {
    throw new Error('Not enough cards remaining in the deck');
  }

  return {
    cards: deck.slice(0, count),
    deck: deck.slice(count)
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

export function shuffleDeck(cards: readonly CardCode[], rng: GameRng = Math.random) {
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
    {
      ...player,
      ready: false,
      seat: state.players.length,
      holeCardCount: 0
    }
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

export function canStartGame(state: GameState) {
  return (
    state.phase === 'lobby' &&
    state.players.length >= 2 &&
    state.players.every((player) => player.connected) &&
    state.players.every((player) => player.ready)
  );
}

export function startGame(state: GameState, rng: GameRng = Math.random): GameState {
  if (!canStartGame(state)) {
    throw new Error('Game cannot start yet');
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
    holeCardCount: privateHands[player.id]?.length ?? 0
  }));
  const dealerSeat = players[0]?.seat ?? null;

  return {
    ...state,
    phase: 'playing',
    startedAt: Date.now(),
    finishedAt: null,
    status: describePlayingStatus('pre-flop'),
    players,
    round: 1,
    street: 'pre-flop',
    dealerSeat,
    activeSeat: dealerSeat,
    communityCards: [],
    deck,
    privateHands
  };
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
    status: winnerId ? `Winner: ${winnerId}` : 'Game finished'
  };
}
