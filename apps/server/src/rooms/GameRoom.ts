import { Client, Room } from 'colyseus';

import { GameState, PlayerState } from '@booger/shared';
import { createInitialGameState } from '@booger/game';

export class GameRoom extends Room<{ state: GameState }> {
  onCreate() {
    this.maxClients = 6;
    this.setState(createInitialGameState());
  }

  onJoin(client: Client, options: { name?: string } = {}) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = options.name ?? 'Player';
    player.connected = true;

    this.state.players.push(player);
  }

  onLeave(client: Client) {
    const player = this.state.players.find((entry) => entry.id === client.sessionId);
    if (player) {
      player.connected = false;
    }
  }
}
