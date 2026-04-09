export type GamePhase = 'lobby' | 'playing' | 'finished';

export interface GamePlayer {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  seat: number;
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
}

const DEFAULT_MAX_PLAYERS = 6;

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
    finishedAt: null
  };
}

export function addPlayer(
  state: GameState,
  player: Pick<GamePlayer, 'id' | 'name' | 'connected'>
): GameState {
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
      seat: state.players.length
    }
  ]);

  return {
    ...state,
    hostId: state.hostId ?? player.id,
    players,
    status: state.phase === 'lobby' ? describeLobbyStatus({ players }) : state.status
  };
}

export function removePlayer(state: GameState, playerId: string): GameState {
  const players = reindexPlayers(state.players.filter((player) => player.id !== playerId));

  return {
    ...state,
    hostId: updateHost(state, players),
    players,
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

export function startGame(state: GameState): GameState {
  if (!canStartGame(state)) {
    throw new Error('Game cannot start yet');
  }

  return {
    ...state,
    phase: 'playing',
    startedAt: Date.now(),
    status: 'Game in progress',
    players: state.players.map((player) => ({
      ...player,
      ready: false
    }))
  };
}

export function finishGame(state: GameState, winnerId: string | null = null): GameState {
  return {
    ...state,
    phase: 'finished',
    finishedAt: Date.now(),
    status: winnerId ? `Winner: ${winnerId}` : 'Game finished'
  };
}
