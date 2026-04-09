export declare class PlayerSchema {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  seat: number;
  holeCardCount: number;
  confidenceRank: number;
  actualRank: number;
  handLabel: string;
}

export declare class GameStateSchema {
  roomId: string;
  phase: string;
  hostId: string;
  maxPlayers: number;
  status: string;
  outcome: string;
  campaignStatus: string;
  successfulHands: number;
  failedHands: number;
  targetSuccesses: number;
  maxFailures: number;
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
