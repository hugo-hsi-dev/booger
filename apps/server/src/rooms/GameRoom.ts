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
import {
  createRoomState,
  LobbyActionMessageSchema,
  normalizeLobbyJoinOptions,
  syncRoomState,
  TableActionMessageSchema,
  GameStateSchema
} from '@booger/shared';

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

    this.onMessage('lobby-action', (client, message) => {
      this.handleLobbyAction(client, message);
    });

    this.onMessage('table-action', (client, message) => {
      this.handleTableAction(client, message);
    });
  }

  onJoin(client: Client, options: unknown = {}) {
    const normalizedOptions = normalizeLobbyJoinOptions(options);

    this.gameState = addPlayer(this.gameState, {
      id: client.sessionId,
      name:
        normalizedOptions.name ??
        `Player ${this.gameState.players.length + 1}`,
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

  private handleLobbyAction(client: Client, rawMessage: unknown) {
    const parsed = LobbyActionMessageSchema.safeParse(rawMessage);

    if (!parsed.success) {
      this.sendActionError(client, 'lobby-action', 'Invalid lobby action payload');
      return;
    }

    const lobbyMessage = parsed.data;

    switch (lobbyMessage.type) {
      case 'set-ready':
        this.applyAction(client, 'set-ready', () => {
          this.gameState = setPlayerReady(
            this.gameState,
            client.sessionId,
            Boolean(lobbyMessage.ready)
          );
        });
        return;
      case 'start-game':
        if (!this.isHost(client)) {
          this.sendActionError(client, 'start-game', 'Host only action', ACTION_ERROR_CODES.FORBIDDEN);
          return;
        }

        this.applyAction(client, 'start-game', () => {
          this.gameState = startGame(this.gameState);
          this.sendPrivateStateToAll();
        });
    }
  }

  private handleTableAction(client: Client, rawMessage: unknown) {
    const parsed = TableActionMessageSchema.safeParse(rawMessage);

    if (!parsed.success) {
      this.sendActionError(client, 'table-action', 'Invalid table action payload');
      return;
    }

    const tableMessage = parsed.data;

    switch (tableMessage.type) {
      case 'sync-private-state':
        this.sendPrivateState(client);
        return;
      case 'set-confidence':
        this.applyAction(client, 'set-confidence', () => {
          this.gameState = setPlayerConfidence(
            this.gameState,
            client.sessionId,
            tableMessage.confidenceRank ?? null
          );
        });
        return;
      default:
        break;
    }

    if (!this.isHost(client)) {
      this.sendActionError(client, 'table-action', 'Host only action', ACTION_ERROR_CODES.FORBIDDEN);
      return;
    }

    switch (tableMessage.type) {
      case 'advance-street':
        this.applyAction(client, 'advance-street', () => {
          this.gameState = advanceStreet(this.gameState);
        });
        return;
      case 'resolve-showdown':
        this.applyAction(client, 'resolve-showdown', () => {
          if (!canResolveShowdown(this.gameState)) {
            throw new Error('Showdown cannot be resolved yet');
          }

          this.gameState = resolveShowdown(this.gameState);
        });
        return;
      case 'next-hand':
        this.applyAction(client, 'next-hand', () => {
          this.gameState = startNextHand(this.gameState);
          this.sendPrivateStateToAll();
        });
        return;
      case 'restart-run':
        this.applyAction(client, 'restart-run', () => {
          this.gameState = restartCampaign(this.gameState);
        });
    }
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
    const message =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : 'Unexpected room error';
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
