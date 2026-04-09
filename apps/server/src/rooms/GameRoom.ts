import { Client, Room } from 'colyseus';

import {
  addPlayer,
  advanceStreet,
  canResolveShowdown,
  createInitialGameState,
  getPlayerHand,
  removePlayer,
  resolveShowdown,
  restartCampaign,
  setPlayerConfidence,
  setPlayerConnected,
  setPlayerReady,
  startGame,
  startNextHand,
  type CardCode,
  type GameState,
  type TableStreet
} from '@booger/game';
import { createRoomState, syncRoomState, GameStateSchema } from '@booger/shared';

interface LobbyJoinOptions {
  name?: string;
}

interface LobbyActionMessage {
  type: 'set-ready' | 'start-game';
  ready?: boolean;
}

interface TableActionMessage {
  type:
    | 'advance-street'
    | 'resolve-showdown'
    | 'restart-run'
    | 'set-confidence'
    | 'next-hand'
    | 'sync-private-state';
  confidenceRank?: number | null;
}

interface PrivateStateMessage {
  holeCards: CardCode[];
  round: number;
  street: TableStreet;
}

const ACTION_ERROR_CODES = {
  FORBIDDEN: 4403,
  INVALID_ACTION: 4400
} as const;

export class GameRoom extends Room<{ state: GameStateSchema }> {
  private gameState: GameState = createInitialGameState();

  onCreate() {
    this.maxClients = this.gameState.maxPlayers;
    this.gameState = {
      ...this.gameState,
      roomId: this.roomId
    };
    this.setState(createRoomState(this.gameState));
    void this.updateRoomAccess();

    this.onMessage<LobbyActionMessage>('lobby-action', (client, message) => {
      if (message.type === 'set-ready') {
        this.applyAction(client, 'set-ready', () => {
          this.gameState = setPlayerReady(
            this.gameState,
            client.sessionId,
            Boolean(message.ready)
          );
        });
        return;
      }

      if (message.type === 'start-game') {
        if (!this.isHost(client)) {
          this.sendActionError(client, 'start-game', 'Host only action', ACTION_ERROR_CODES.FORBIDDEN);
          return;
        }

        this.applyAction(client, 'start-game', () => {
          this.gameState = startGame(this.gameState);
          this.sendPrivateStateToAll();
        });
      }
    });

    this.onMessage<TableActionMessage>('table-action', (client, message) => {
      if (message.type === 'sync-private-state') {
        this.sendPrivateState(client);
        return;
      }

      if (message.type === 'set-confidence') {
        this.applyAction(client, 'set-confidence', () => {
          this.gameState = setPlayerConfidence(
            this.gameState,
            client.sessionId,
            message.confidenceRank ?? null
          );
        });
        return;
      }

      if (!this.isHost(client)) {
        this.sendActionError(client, 'table-action', 'Host only action', ACTION_ERROR_CODES.FORBIDDEN);
        return;
      }

      if (message.type === 'advance-street') {
        this.applyAction(client, 'advance-street', () => {
          this.gameState = advanceStreet(this.gameState);
        });
        return;
      }

      if (message.type === 'resolve-showdown') {
        this.applyAction(client, 'resolve-showdown', () => {
          if (!canResolveShowdown(this.gameState)) {
            throw new Error('Showdown cannot be resolved yet');
          }

          this.gameState = resolveShowdown(this.gameState);
        });
        return;
      }

      if (message.type === 'next-hand') {
        this.applyAction(client, 'next-hand', () => {
          this.gameState = startNextHand(this.gameState);
          this.sendPrivateStateToAll();
        });
        return;
      }

      if (message.type === 'restart-run') {
        this.applyAction(client, 'restart-run', () => {
          this.gameState = restartCampaign(this.gameState);
        });
      }
    });
  }

  onJoin(client: Client, options: LobbyJoinOptions = {}) {
    this.gameState = addPlayer(this.gameState, {
      id: client.sessionId,
      name: options.name ?? `Player ${this.gameState.players.length + 1}`,
      connected: true
    });

    this.syncState();
  }

  onLeave(client: Client) {
    this.gameState = removePlayer(this.gameState, client.sessionId);
    this.syncState();
  }

  onDrop(client: Client) {
    this.gameState = setPlayerConnected(this.gameState, client.sessionId, false);
    this.syncState();

    this.allowReconnection(client, 15)
      .then((reconnectedClient) => {
        this.gameState = setPlayerConnected(this.gameState, reconnectedClient.sessionId, true);
        this.syncState();
        this.sendPrivateState(reconnectedClient);
      })
      .catch(() => {
        // no-op: the player fully left the room
      });
  }

  private isHost(client: Client) {
    return client.sessionId === this.gameState.hostId;
  }

  private applyAction(client: Client, action: string, mutate: () => void) {
    try {
      mutate();
      this.syncState();
    } catch (error) {
      this.sendActionError(client, action, error);
    }
  }

  private sendActionError(
    client: Client,
    action: string,
    error: unknown,
    code: number = ACTION_ERROR_CODES.INVALID_ACTION
  ) {
    const message = error instanceof Error ? error.message : 'Unexpected room error';
    client.error(code, `${action}: ${message}`);
  }

  private async updateRoomAccess() {
    try {
      if (this.gameState.phase === 'lobby') {
        await this.unlock();
      } else {
        await this.lock();
      }
    } catch {
      // best-effort matchmaking state update
    }
  }

  private syncState() {
    syncRoomState(this.state, this.gameState);
    void this.updateRoomAccess();
  }

  private sendPrivateState(client: Client) {
    const message: PrivateStateMessage = {
      holeCards: getPlayerHand(this.gameState, client.sessionId),
      round: this.gameState.round,
      street: this.gameState.street
    };

    client.send('private-state', message);
  }

  private sendPrivateStateToAll() {
    for (const client of this.clients) {
      this.sendPrivateState(client);
    }
  }
}
