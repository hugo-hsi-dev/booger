import { Client, Room } from 'colyseus';

import {
  addPlayer,
  createInitialGameState,
  removePlayer,
  setPlayerConnected,
  setPlayerReady,
  startGame,
  type GameState
} from '@booger/game';
import { createRoomState, syncRoomState, GameStateSchema } from '@booger/shared';

interface LobbyJoinOptions {
  name?: string;
}

interface LobbyActionMessage {
  type: 'set-ready' | 'start-game';
  ready?: boolean;
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
      }

      syncRoomState(this.state, this.gameState);
    });
  }

  onJoin(client: Client, options: LobbyJoinOptions = {}) {
    this.gameState = addPlayer(this.gameState, {
      id: client.sessionId,
      name: options.name ?? `Player ${this.gameState.players.length + 1}`,
      connected: true
    });

    syncRoomState(this.state, this.gameState);
  }

  onLeave(client: Client) {
    this.gameState = removePlayer(this.gameState, client.sessionId);
    syncRoomState(this.state, this.gameState);
  }

  onDrop(client: Client) {
    this.gameState = setPlayerConnected(this.gameState, client.sessionId, false);
    syncRoomState(this.state, this.gameState);

    this.allowReconnection(client, 15)
      .then((reconnectedClient) => {
        this.gameState = setPlayerConnected(this.gameState, reconnectedClient.sessionId, true);
        syncRoomState(this.state, this.gameState);
      })
      .catch(() => {
        // no-op: the player fully left the room
      });
  }
}
