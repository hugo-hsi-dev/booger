import { Client, Room } from 'colyseus';

import {
  addPlayer,
  advanceStreet,
  createInitialGameState,
  getPlayerHand,
  removePlayer,
  setPlayerConnected,
  setPlayerReady,
  startGame,
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
  type: 'advance-street' | 'sync-private-state';
}

interface PrivateStateMessage {
  holeCards: CardCode[];
  round: number;
  street: TableStreet;
}

export class GameRoom extends Room<{ state: GameStateSchema }> {
  private gameState: GameState = createInitialGameState();

  onCreate() {
    this.maxClients = this.gameState.maxPlayers;
    this.gameState = {
      ...this.gameState,
      roomId: this.roomId
    };
    this.setState(createRoomState(this.gameState));

    this.onMessage<LobbyActionMessage>('lobby-action', (client, message) => {
      if (message.type === 'set-ready') {
        this.gameState = setPlayerReady(
          this.gameState,
          client.sessionId,
          Boolean(message.ready)
        );
      }

      if (message.type === 'start-game') {
        if (client.sessionId !== this.gameState.hostId) {
          return;
        }

        this.gameState = startGame(this.gameState);
        this.syncState();
        this.sendPrivateStateToAll();
        return;
      }

      this.syncState();
    });

    this.onMessage<TableActionMessage>('table-action', (client, message) => {
      if (message.type === 'sync-private-state') {
        this.sendPrivateState(client);
        return;
      }

      if (message.type === 'advance-street') {
        if (client.sessionId !== this.gameState.hostId) {
          return;
        }

        this.gameState = advanceStreet(this.gameState);
        this.syncState();
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

  private syncState() {
    syncRoomState(this.state, this.gameState);
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
