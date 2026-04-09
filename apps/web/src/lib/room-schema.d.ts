export declare class PlayerSchema {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  seat: number;
  holeCardCount: number;
}

export declare class GameStateSchema {
  roomId: string;
  phase: string;
  hostId: string;
  maxPlayers: number;
  status: string;
  players: PlayerSchema[];
  createdAt: number;
  startedAt: number;
  finishedAt: number;
  round: number;
  street: string;
  dealerSeat: number;
  activeSeat: number;
  communityCards: string[];
}
