import { Client, type Room } from './colyseus-client.js';
import { GameStateSchema } from './room-schema.js';

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  seat: number;
}

export interface RoomView {
  roomId: string;
  phase: RoomPhase;
  hostId: string;
  maxPlayers: number;
  status: string;
  createdAt: number;
  startedAt: number;
  finishedAt: number;
  players: PlayerView[];
}

export interface GameStateSnapshot extends RoomView {}

export const ROOM_NAME = 'game';

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

export function toRoomView(state: GameStateSnapshot): RoomView {
  return {
    roomId: state.roomId,
    phase: state.phase,
    hostId: state.hostId,
    maxPlayers: state.maxPlayers,
    status: state.status,
    createdAt: state.createdAt,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    players: (state.players ?? []).map(toPlayerView)
  };
}

function toPlayerView(player: PlayerView): PlayerView {
  return {
    id: player.id,
    name: player.name,
    connected: player.connected,
    ready: player.ready,
    seat: player.seat
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
      processId: response.processId
    },
    sessionId: response.sessionId,
    protocol: response.protocol ?? 'ws',
    reconnectionToken: response.reconnectionToken,
    devMode: response.devMode
  };
}
