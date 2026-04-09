import { Client, type Room } from './colyseus-client.js';
import { GameStateSchema } from '@booger/shared';

export type RoomPhase = 'lobby' | 'playing' | 'finished';
export type GameOutcome = 'pending' | 'success' | 'failure';
export type CampaignStatus = 'ongoing' | 'won' | 'lost';
export type TableStreet = 'idle' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';
export type CardSuit = 'S' | 'H' | 'D' | 'C';
export type CardRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type CardCode = `${CardRank}${CardSuit}`;

export interface PlayerView {
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

export interface RoomView {
  roomId: string;
  phase: RoomPhase;
  hostId: string;
  maxPlayers: number;
  status: string;
  outcome: GameOutcome;
  campaignStatus: CampaignStatus;
  successfulHands: number;
  failedHands: number;
  targetSuccesses: number;
  maxFailures: number;
  createdAt: number;
  startedAt: number;
  finishedAt: number;
  round: number;
  street: TableStreet;
  dealerSeat: number | null;
  activeSeat: number | null;
  communityCards: CardCode[];
  players: PlayerView[];
}

export interface PrivateStateMessage {
  holeCards: CardCode[];
  round: number;
  street: TableStreet;
}

export interface GameStateSnapshot extends RoomView {}

export const ROOM_NAME = 'game';
export const PRIVATE_STATE_MESSAGE = 'private-state';
export const TABLE_ACTION_MESSAGE = 'table-action';

export function createGameClient(endpoint: string) {
  return new Client(endpoint);
}

export async function createRoom(client: Client, roomName: string, options: JoinOptions) {
  const response = await client.http.post<SeatReservation>(`matchmake/create/${roomName}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(options)
  });

  return client.consumeSeatReservation(normalizeSeatReservation(response.data) as any, GameStateSchema);
}

export async function joinRoom(client: Client, roomId: string, options: JoinOptions) {
  const response = await client.http.post<SeatReservation>(`matchmake/joinById/${roomId}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(options)
  });

  return client.consumeSeatReservation(normalizeSeatReservation(response.data) as any, GameStateSchema);
}

export async function reconnectRoom(client: Client, reconnectionToken: string) {
  const [roomId, token] = reconnectionToken.split(':');

  if (!roomId || !token) {
    throw new Error('Invalid reconnection token');
  }

  const response = await client.http.post<SeatReservation>(`matchmake/reconnect/${roomId}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reconnectionToken: token })
  });

  return client.consumeSeatReservation(
    normalizeSeatReservation({ ...response.data, reconnectionToken: token }) as any,
    GameStateSchema
  );
}

export function toRoomView(state: GameStateSnapshot): RoomView {
  return {
    roomId: state.roomId,
    phase: state.phase,
    hostId: state.hostId,
    maxPlayers: state.maxPlayers,
    status: state.status,
    outcome: state.outcome ?? 'pending',
    campaignStatus: state.campaignStatus ?? 'ongoing',
    successfulHands: state.successfulHands ?? 0,
    failedHands: state.failedHands ?? 0,
    targetSuccesses: state.targetSuccesses ?? 3,
    maxFailures: state.maxFailures ?? 3,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    round: state.round ?? 0,
    street: state.street ?? 'idle',
    dealerSeat: state.dealerSeat === -1 ? null : state.dealerSeat,
    activeSeat: state.activeSeat === -1 ? null : state.activeSeat,
    communityCards: [...(state.communityCards ?? [])],
    players: (state.players ?? []).map(toPlayerView)
  };
}

function toPlayerView(player: PlayerView): PlayerView {
  return {
    id: player.id,
    name: player.name,
    connected: player.connected,
    ready: player.ready,
    seat: player.seat,
    holeCardCount: player.holeCardCount ?? 0,
    confidenceRank: player.confidenceRank === -1 ? null : player.confidenceRank,
    actualRank: player.actualRank === -1 ? null : player.actualRank,
    handLabel: player.handLabel || null
  };
}

export function getServerEndpoint() {
  return import.meta.env.VITE_COLYSEUS_URL ?? 'ws://localhost:2567';
}

export type GameRoomClient = Room<GameStateSnapshot>;

type JoinOptions = Record<string, unknown>;
type SeatReservation = {
  name: string;
  roomId: string;
  processId: string;
  publicAddress?: string;
  sessionId: string;
  protocol?: string;
  reconnectionToken?: string;
  devMode?: boolean;
};

type SeatReservationEnvelope = {
  room: {
    name: string;
    roomId: string;
    processId: string;
    publicAddress?: string;
  };
  sessionId: string;
  protocol: string;
  reconnectionToken?: string;
  devMode?: boolean;
};

function normalizeSeatReservation(response: SeatReservation): SeatReservationEnvelope {
  return {
    room: {
      name: response.name,
      roomId: response.roomId,
      processId: response.processId,
      publicAddress: response.publicAddress
    },
    sessionId: response.sessionId,
    protocol: response.protocol ?? 'ws',
    reconnectionToken: response.reconnectionToken,
    devMode: response.devMode
  };
}
