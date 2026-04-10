import { browser } from '$app/environment';

import {
  createGameClient,
  createRoom,
  joinRoom,
  reconnectRoom,
  PRIVATE_STATE_MESSAGE,
  ROOM_NAME,
  TABLE_ACTION_MESSAGE,
  toRoomView,
  type GameRoomClient,
  type PrivateStateMessage,
  type RoomView
} from './game-client.js';

const ROOM_SESSION_KEY = 'booger:lobby-session';
const PLAYER_NAME_KEY = 'booger:player-name';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export class RoomSession {
  readonly endpoint: string;

  playerName = $state('Player');
  roomCode = $state('');
  connectionState = $state<ConnectionState>('idle');
  banner = $state('Create a room or join with a code.');
  errorMessage = $state('');
  mySessionId = $state('');
  roomView = $state<RoomView | null>(null);
  privateState = $state<PrivateStateMessage | null>(null);

  private client = $state.raw<ReturnType<typeof createGameClient> | null>(null);
  private room = $state.raw<GameRoomClient | null>(null);
  private activeRoomId = $state('');
  private isPageUnloading = false;
  private hasInitialized = false;

  constructor(endpoint: string) {
    this.endpoint = endpoint;

    const storedName = this.readStoredPlayerName();
    if (storedName) {
      this.playerName = storedName;
    }
  }

  get totalPlayers() {
    return this.roomView?.players.length ?? 0;
  }

  get connectedPlayers() {
    return this.roomView?.players.filter((player) => player.connected).length ?? 0;
  }

  get readyPlayers() {
    return this.roomView?.players.filter((player) => player.ready).length ?? 0;
  }

  get me() {
    return this.roomView?.players.find((player) => player.id === this.mySessionId) ?? null;
  }

  get isHost() {
    return Boolean(this.roomView && this.mySessionId && this.roomView.hostId === this.mySessionId);
  }

  get hasHandView() {
    return Boolean(this.roomView && this.roomView.phase !== 'lobby');
  }

  get isPlaying() {
    return this.roomView?.phase === 'playing';
  }

  get isFinished() {
    return this.roomView?.phase === 'finished';
  }

  get holeCards() {
    return this.privateState?.holeCards ?? [];
  }

  get boardSlots() {
    return Array.from({ length: 5 }, (_, index) => this.roomView?.communityCards[index] ?? null);
  }

  get confidenceSlots() {
    return Array.from({ length: this.totalPlayers }, (_, index) => index + 1);
  }

  get canStart() {
    return Boolean(
      this.roomView &&
        this.roomView.phase === 'lobby' &&
        this.isHost &&
        this.roomView.players.length >= 2 &&
        this.roomView.players.every((player) => player.connected && player.ready)
    );
  }

  get canAdvanceStreet() {
    return Boolean(this.roomView && this.roomView.phase === 'playing' && this.isHost && this.roomView.street !== 'showdown');
  }

  get canResolveShowdown() {
    return Boolean(
      this.roomView &&
        this.roomView.phase === 'playing' &&
        this.roomView.street === 'showdown' &&
        this.isHost &&
        this.roomView.players.every((player) => player.confidenceRank !== null)
    );
  }

  get canDealNextHand() {
    return Boolean(
      this.roomView &&
        this.roomView.phase === 'finished' &&
        this.roomView.campaignStatus === 'ongoing' &&
        this.isHost &&
        this.roomView.players.length >= 2 &&
        this.roomView.players.every((player) => player.connected)
    );
  }

  get canRestartRun() {
    return Boolean(this.roomView && this.roomView.phase === 'finished' && this.isHost);
  }

  get advanceStreetLabel() {
    if (!this.roomView) return 'Advance street';

    switch (this.roomView.street) {
      case 'pre-flop':
        return 'Reveal flop';
      case 'flop':
        return 'Reveal turn';
      case 'turn':
        return 'Reveal river';
      case 'river':
        return 'Go to showdown';
      default:
        return 'Street complete';
    }
  }

  get roomId() {
    return this.activeRoomId || this.roomView?.roomId || null;
  }

  init() {
    if (!browser || this.hasInitialized) {
      return;
    }

    this.hasInitialized = true;
    const savedSession = this.readSavedSession();

    if (!savedSession) {
      return;
    }

    if (savedSession.endpoint !== this.endpoint) {
      this.clearSavedSession();
      return;
    }

    void this.reconnectSavedSession(savedSession);
  }

  markPageUnloading() {
    this.isPageUnloading = true;
  }

  setRoomCode(roomCode: string) {
    this.roomCode = roomCode;
  }

  setPlayerName(playerName: string) {
    this.playerName = playerName;
    this.persistPlayerName();
  }

  async connect(mode: 'create' | 'join', roomId = this.roomCode.trim()) {
    if (this.connectionState === 'connecting') {
      return null;
    }

    if (mode === 'join' && !roomId) {
      this.errorMessage = 'Enter a room code first.';
      return null;
    }

    this.errorMessage = '';
    this.banner = mode === 'create' ? 'Creating room…' : `Joining ${roomId}…`;
    this.connectionState = 'connecting';
    this.isPageUnloading = false;

    await this.leaveCurrentRoom(true);
    this.resetRoomState();

    try {
      const nextRoom =
        mode === 'create'
          ? await createRoom(this.ensureClient(), ROOM_NAME, { name: this.playerName.trim() || 'Player' })
          : await joinRoom(this.ensureClient(), roomId, { name: this.playerName.trim() || 'Player' });

      this.bindRoom(nextRoom, mode === 'create' ? `Room created: ${nextRoom.roomId}` : `Joined room: ${nextRoom.roomId}`);
      return nextRoom;
    } catch (error) {
      this.connectionState = 'error';
      this.banner = 'Failed to connect';
      this.resetRoomState();
      this.room = null;
      this.errorMessage = error instanceof Error ? error.message : 'Could not connect to the room';
      return null;
    }
  }

  async joinRoomFromRoute(roomId: string) {
    if (this.roomView?.roomId === roomId) {
      return this.room;
    }

    if (this.roomView && this.roomView.roomId !== roomId) {
      this.errorMessage = `You're already in room ${this.roomView.roomId}. Leave it first to join ${roomId}.`;
      this.banner = 'Another room is already active';
      return null;
    }

    return this.connect('join', roomId);
  }

  async switchRoom(roomId: string) {
    await this.disconnect();
    return this.connect('join', roomId);
  }

  async disconnect() {
    if (!this.room) {
      this.clearSavedSession();
      this.resetRoomState();
      this.connectionState = 'idle';
      this.banner = 'Room left';
      return;
    }

    this.isPageUnloading = false;
    this.clearSavedSession();
    this.banner = 'Leaving room…';

    await this.leaveCurrentRoom(true);
    this.resetRoomState();
    this.connectionState = 'idle';
    this.banner = 'Room left';
  }

  shutdown() {
    if (!this.room) {
      return;
    }

    this.isPageUnloading = true;
    void this.leaveCurrentRoom(false);
  }

  toggleReady() {
    if (!this.roomView || this.roomView.phase !== 'lobby') {
      return;
    }

    this.sendLobbyAction({ type: 'set-ready', ready: !(this.me?.ready ?? false) });
  }

  startGame() {
    this.sendLobbyAction({ type: 'start-game' });
  }

  renamePlayer(name: string) {
    const normalized = name.trim();

    if (!normalized) {
      this.errorMessage = 'Name cannot be empty.';
      return;
    }

    this.setPlayerName(normalized);

    if (!this.roomView || this.roomView.phase !== 'lobby') {
      this.errorMessage = 'Names can only be changed in the lobby.';
      return;
    }

    this.sendLobbyAction({ type: 'set-name', name: normalized });
    this.banner = 'Display name updated';
  }

  advanceStreet() {
    this.sendTableAction({ type: 'advance-street' });
  }

  resolveShowdown() {
    this.sendTableAction({ type: 'resolve-showdown' });
  }

  dealNextHand() {
    this.sendTableAction({ type: 'next-hand' });
  }

  restartRun() {
    this.sendTableAction({ type: 'restart-run' });
  }

  claimConfidenceRank(confidenceRank: number) {
    if (this.roomView?.phase !== 'playing') {
      return;
    }

    this.applyOptimisticConfidenceRank(confidenceRank);
    this.banner = `Claimed confidence slot #${confidenceRank}`;
    this.sendTableAction({ type: 'set-confidence', confidenceRank });
  }

  clearConfidenceRank() {
    if (this.roomView?.phase !== 'playing') {
      return;
    }

    this.applyOptimisticConfidenceRank(null);
    this.banner = 'Confidence slot cleared';
    this.sendTableAction({ type: 'set-confidence', confidenceRank: null });
  }

  requestPrivateState(targetRoom: GameRoomClient | null = this.room) {
    targetRoom?.send(TABLE_ACTION_MESSAGE, { type: 'sync-private-state' });
  }

  private ensureClient() {
    this.client ??= createGameClient(this.endpoint);
    return this.client;
  }

  private async leaveCurrentRoom(consented: boolean) {
    if (!this.room) {
      return;
    }

    const existingRoom = this.room;
    this.room = null;
    existingRoom.removeAllListeners();
    await existingRoom.leave(consented).catch(() => undefined);
  }

  private bindRoom(nextRoom: GameRoomClient, nextBanner: string) {
    this.room = nextRoom;
    this.activeRoomId = nextRoom.roomId;
    this.mySessionId = nextRoom.sessionId;
    this.setSnapshot(nextRoom.state);
    this.banner = nextBanner;
    this.roomCode = nextRoom.roomId;
    this.connectionState = 'connected';
    this.isPageUnloading = false;
    this.persistSession(nextRoom);

    nextRoom.onMessage<PrivateStateMessage>(PRIVATE_STATE_MESSAGE, (message) => {
      this.privateState = {
        holeCards: [...(message.holeCards ?? [])],
        round: message.round,
        street: message.street
      };
    });

    nextRoom.onStateChange((state) => {
      const previousPhase = this.roomView?.phase;
      this.setSnapshot(state);
      this.persistSession(nextRoom);

      if (state.phase === 'lobby') {
        this.privateState = null;
        return;
      }

      if (!this.privateState?.holeCards.length || previousPhase !== state.phase) {
        this.requestPrivateState(nextRoom);
      }
    });

    nextRoom.onError((code, message) => {
      this.connectionState = 'error';
      this.errorMessage = message ?? `Room error ${code}`;
      this.banner = 'Connection issue';
    });

    nextRoom.onLeave((_code, reason) => {
      this.connectionState = 'idle';
      this.errorMessage = '';
      this.banner = reason ? `Left room: ${reason}` : 'Left room';
      this.resetRoomState();
      this.room = null;

      if (!this.isPageUnloading) {
        this.clearSavedSession();
      }
    });

    if (nextRoom.state.phase !== 'lobby') {
      this.requestPrivateState(nextRoom);
    }
  }

  private async reconnectSavedSession(savedSession: SavedSession) {
    if (this.connectionState === 'connecting') {
      return;
    }

    this.playerName = savedSession.playerName;
    this.roomCode = savedSession.roomId;
    this.errorMessage = '';
    this.banner = `Reconnecting to ${savedSession.roomId}…`;
    this.connectionState = 'connecting';
    this.resetRoomState();

    try {
      const nextRoom = await reconnectRoom(this.ensureClient(), savedSession.reconnectionToken);
      this.bindRoom(nextRoom, `Reconnected to room: ${nextRoom.roomId}`);
    } catch (error) {
      this.connectionState = 'error';
      this.banner = 'Reconnect expired';
      this.clearSavedSession();
      this.resetRoomState();
      this.room = null;
      this.errorMessage = error instanceof Error ? error.message : 'Could not reconnect to the room';
    }
  }

  private sendLobbyAction(action: { type: 'set-ready'; ready?: boolean } | { type: 'set-name'; name: string } | { type: 'start-game' }) {
    this.room?.send('lobby-action', action);
  }

  private sendTableAction(
    action:
      | { type: 'advance-street' }
      | { type: 'resolve-showdown' }
      | { type: 'restart-run' }
      | { type: 'set-confidence'; confidenceRank?: number | null }
      | { type: 'next-hand' }
      | { type: 'sync-private-state' }
  ) {
    this.room?.send(TABLE_ACTION_MESSAGE, action);
  }

  private applyOptimisticConfidenceRank(confidenceRank: number | null) {
    if (!this.roomView || !this.mySessionId) {
      return;
    }

    this.roomView = {
      ...this.roomView,
      players: this.roomView.players.map((player) =>
        player.id === this.mySessionId
          ? { ...player, confidenceRank }
          : confidenceRank !== null && player.confidenceRank === confidenceRank
            ? { ...player, confidenceRank: null }
            : player
      )
    };
  }

  private setSnapshot(state: RoomView) {
    this.roomView = toRoomView(state);
  }

  private resetRoomState() {
    this.mySessionId = '';
    this.activeRoomId = '';
    this.roomView = null;
    this.privateState = null;
  }

  private readSavedSession(): SavedSession | null {
    if (!browser) return null;

    const raw = sessionStorage.getItem(ROOM_SESSION_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Partial<SavedSession>;

      if (
        typeof parsed.endpoint === 'string' &&
        typeof parsed.playerName === 'string' &&
        typeof parsed.roomId === 'string' &&
        typeof parsed.reconnectionToken === 'string'
      ) {
        return parsed as SavedSession;
      }
    } catch {
      // ignore malformed session data
    }

    this.clearSavedSession();
    return null;
  }

  private persistSession(nextRoom: GameRoomClient) {
    if (!browser || !nextRoom.reconnectionToken) return;

    const savedSession: SavedSession = {
      endpoint: this.endpoint,
      playerName: this.playerName.trim() || 'Player',
      roomId: nextRoom.roomId,
      reconnectionToken: nextRoom.reconnectionToken
    };

    sessionStorage.setItem(ROOM_SESSION_KEY, JSON.stringify(savedSession));
  }

  private clearSavedSession() {
    if (!browser) return;
    sessionStorage.removeItem(ROOM_SESSION_KEY);
  }

  private persistPlayerName() {
    if (!browser) return;
    localStorage.setItem(PLAYER_NAME_KEY, this.playerName.trim() || 'Player');
  }

  private readStoredPlayerName() {
    if (!browser) return null;

    const storedName = localStorage.getItem(PLAYER_NAME_KEY);
    return storedName?.trim() || null;
  }
}

type SavedSession = {
  endpoint: string;
  playerName: string;
  roomId: string;
  reconnectionToken: string;
};
