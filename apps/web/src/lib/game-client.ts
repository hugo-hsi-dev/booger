import { Client, type Room } from './colyseus-client.js';


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
    players: state.players.map(toPlayerView)
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
