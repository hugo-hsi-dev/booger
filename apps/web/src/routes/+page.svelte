<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import {
    createGameClient,
    createRoom,
    getServerEndpoint,
    joinRoom,
    reconnectRoom,
    ROOM_NAME,
    toRoomView,
    type GameRoomClient,
    type PlayerView,
    type RoomView
  } from '$lib/game-client';

  type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
  type LobbyActionMessage = {
    type: 'set-ready' | 'start-game';
    ready?: boolean;
  };
  type SavedRoomSession = {
    endpoint: string;
    playerName: string;
    roomId: string;
    reconnectionToken: string;
  };

  const endpoint = getServerEndpoint();
  const SESSION_STORAGE_KEY = 'booger:lobby-session';

  let playerName = $state('Player');
  let roomCode = $state('');
  let connectionState = $state<ConnectionState>('idle');
  let banner = $state('Create a room or join with a code.');
  let errorMessage = $state('');
  let mySessionId = $state('');
  let roomView = $state<RoomView | null>(null);
  let isPageUnloading = false;

  let client = $state.raw<ReturnType<typeof createGameClient> | null>(null);
  let room = $state.raw<GameRoomClient | null>(null);

  let totalPlayers = $derived(roomView?.players.length ?? 0);
  let connectedPlayers = $derived(roomView?.players.filter((player) => player.connected).length ?? 0);
  let readyPlayers = $derived(roomView?.players.filter((player) => player.ready).length ?? 0);
  let me = $derived(roomView?.players.find((player) => player.id === mySessionId) ?? null);
  let isHost = $derived(Boolean(roomView && mySessionId && roomView.hostId === mySessionId));
  let canStart = $derived(
    Boolean(
      roomView &&
        roomView.phase === 'lobby' &&
        isHost &&
        roomView.players.length >= 2 &&
        roomView.players.every((player) => player.connected && player.ready)
    )
  );
  let connectionLabel = $derived(
    connectionState === 'connecting'
      ? 'connecting'
      : connectionState === 'connected'
        ? 'live'
        : connectionState === 'error'
          ? 'error'
          : 'idle'
  );

  function ensureClient() {
    client ??= createGameClient(endpoint);
    return client;
  }

  function setSnapshot(state: RoomView) {
    roomView = toRoomView(state);
  }

  function resetRoomState() {
    roomView = null;
    mySessionId = '';
  }

  function markPageUnloading() {
    isPageUnloading = true;
  }

  function readSavedSession(): SavedRoomSession | null {
    if (typeof sessionStorage === 'undefined') return null;

    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Partial<SavedRoomSession>;

      if (
        typeof parsed.endpoint === 'string' &&
        typeof parsed.playerName === 'string' &&
        typeof parsed.roomId === 'string' &&
        typeof parsed.reconnectionToken === 'string'
      ) {
        return parsed as SavedRoomSession;
      }
    } catch {
      // ignore malformed session data
    }

    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }

  function persistSession(nextRoom: GameRoomClient) {
    if (typeof sessionStorage === 'undefined' || !nextRoom.reconnectionToken) return;

    const savedSession: SavedRoomSession = {
      endpoint,
      playerName: playerName.trim() || 'Player',
      roomId: nextRoom.roomId,
      reconnectionToken: nextRoom.reconnectionToken
    };

    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(savedSession));
  }

  function clearSavedSession() {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  async function releaseRoom(consented: boolean) {
    if (!room) return;

    const existingRoom = room;
    room = null;
    existingRoom.removeAllListeners();
    await existingRoom.leave(consented).catch(() => undefined);
  }

  function bindRoom(nextRoom: GameRoomClient, nextBanner: string) {
    room = nextRoom;
    mySessionId = nextRoom.sessionId;
    setSnapshot(nextRoom.state);
    banner = nextBanner;
    roomCode = nextRoom.roomId;
    connectionState = 'connected';
    isPageUnloading = false;
    persistSession(nextRoom);

    nextRoom.onStateChange((state) => {
      setSnapshot(state);
      persistSession(nextRoom);
    });

    nextRoom.onError((code, message) => {
      connectionState = 'error';
      errorMessage = message ?? `Room error ${code}`;
      banner = 'Connection issue';
    });

    nextRoom.onLeave((_code, reason) => {
      connectionState = 'idle';
      errorMessage = '';
      banner = reason ? `Left room: ${reason}` : 'Left room';
      resetRoomState();
      room = null;

      if (!isPageUnloading) {
        clearSavedSession();
      }
    });
  }

  async function reconnectSavedSession(savedSession: SavedRoomSession) {
    if (connectionState === 'connecting') return;

    playerName = savedSession.playerName;
    roomCode = savedSession.roomId;
    errorMessage = '';
    banner = `Reconnecting to ${savedSession.roomId}…`;
    connectionState = 'connecting';
    resetRoomState();

    try {
      const nextRoom = await reconnectRoom(ensureClient(), savedSession.reconnectionToken);
      bindRoom(nextRoom, `Reconnected to room: ${nextRoom.roomId}`);
    } catch (error) {
      connectionState = 'error';
      banner = 'Reconnect expired';
      clearSavedSession();
      resetRoomState();
      room = null;
      errorMessage = error instanceof Error ? error.message : 'Could not reconnect to the room';
    }
  }

  async function connect(mode: 'create' | 'join') {
    if (connectionState === 'connecting') return;

    errorMessage = '';
    banner = mode === 'create' ? 'Creating room…' : 'Joining room…';
    connectionState = 'connecting';
    isPageUnloading = false;
    clearSavedSession();

    await releaseRoom(true);
    resetRoomState();

    try {
      const roomName = playerName.trim() || 'Player';
      const nextRoom =
        mode === 'create'
          ? await createRoom(ensureClient(), ROOM_NAME, { name: roomName })
          : await joinRoom(ensureClient(), roomCode.trim(), { name: roomName });

      bindRoom(
        nextRoom,
        mode === 'create' ? `Room created: ${nextRoom.roomId}` : `Joined room: ${nextRoom.roomId}`
      );
    } catch (error) {
      connectionState = 'error';
      banner = 'Failed to connect';
      resetRoomState();
      room = null;
      errorMessage = error instanceof Error ? error.message : 'Could not connect to the room';
    }
  }

  async function disconnect() {
    if (!room) return;

    isPageUnloading = false;
    clearSavedSession();
    banner = 'Disconnecting…';
    await room.leave().catch(() => undefined);
  }

  function sendLobbyAction(action: LobbyActionMessage) {
    room?.send('lobby-action', action);
  }

  function toggleReady() {
    sendLobbyAction({ type: 'set-ready', ready: !(me?.ready ?? false) });
  }

  function startGame() {
    sendLobbyAction({ type: 'start-game' });
  }

  async function copyRoomCode() {
    if (!roomView) return;

    try {
      await navigator.clipboard.writeText(roomView.roomId);
      banner = 'Room code copied';
    } catch {
      banner = 'Copy failed';
    }
  }

  function formatTime(value: number) {
    return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  }

  function playerStatus(player: PlayerView) {
    if (!player.connected) return 'Away';
    return player.ready ? 'Ready' : 'Waiting';
  }

  onMount(() => {
    const savedSession = readSavedSession();

    if (!savedSession) {
      return;
    }

    if (savedSession.endpoint !== endpoint) {
      clearSavedSession();
      return;
    }

    void reconnectSavedSession(savedSession);
  });

  onDestroy(() => {
    markPageUnloading();
    void room?.leave(false).catch(() => undefined);
  });
</script>

<svelte:head>
  <title>The Gang</title>
  <meta
    name="description"
    content="A digital tabletop for The Gang, with realtime lobby sync and server-authoritative game state."
  />
</svelte:head>

<svelte:window onbeforeunload={markPageUnloading} onpagehide={markPageUnloading} />

<main class="shell">
  <div class="backdrop" aria-hidden="true"></div>

  <section class="hero panel">
    <div class="eyebrow">Realtime co-op card table</div>
    <div class="hero-grid">
      <div>
        <h1>The Gang</h1>
        <p class="lede">
          A digital table for the game room, powered by a Colyseus server and a SvelteKit client.
        </p>
      </div>

      <div class="hero-meta">
        <div>
          <span class="meta-label">Server</span>
          <strong>{endpoint}</strong>
        </div>
        <div>
          <span class="meta-label">Room</span>
          <strong>{roomView?.roomId ?? '—'}</strong>
        </div>
        <div>
          <span class="meta-label">Status</span>
          <strong>{banner}</strong>
        </div>
      </div>
    </div>
  </section>

  <section class="content-grid">
    <article class="panel controls">
      <header>
        <div>
          <span class="eyebrow">Lobby control</span>
          <h2>Join or create a room</h2>
        </div>
        <span class={`pill ${connectionLabel}`}>{connectionLabel}</span>
      </header>

      <label>
        Player name
        <input bind:value={playerName} placeholder="Your name" maxlength="24" />
      </label>

      <label>
        Room code
        <input bind:value={roomCode} placeholder="Paste a room code" autocomplete="off" spellcheck="false" />
      </label>

      <div class="button-row">
        <button type="button" class="primary" onclick={() => void connect('create')} disabled={connectionState === 'connecting'}>
          Create room
        </button>
        <button
          type="button"
          class="secondary"
          onclick={() => void connect('join')}
          disabled={connectionState === 'connecting' || roomCode.trim().length === 0}
        >
          Join room
        </button>
      </div>

      <div class="button-row compact">
        <button type="button" class="ghost" onclick={() => void disconnect()} disabled={!roomView}>
          Disconnect
        </button>
        <button type="button" class="ghost" onclick={() => void toggleReady()} disabled={!roomView || !me}>
          {me?.ready ? 'Mark unready' : 'Mark ready'}
        </button>
        <button type="button" class="ghost" onclick={startGame} disabled={!canStart}>
          Start game
        </button>
      </div>

      <p class="banner" aria-live="polite">{banner}</p>
      {#if errorMessage}
        <p class="error" aria-live="assertive">{errorMessage}</p>
      {/if}
    </article>

    <article class="panel table">
      <header>
        <div>
          <span class="eyebrow">Live table</span>
          <h2>Room snapshot</h2>
        </div>

        {#if roomView}
          <button type="button" class="copy" onclick={() => void copyRoomCode()}>{roomView.roomId}</button>
        {/if}
      </header>

      {#if roomView}
        <div class="stats">
          <div>
            <span class="meta-label">Phase</span>
            <strong>{roomView.phase}</strong>
          </div>
          <div>
            <span class="meta-label">Players</span>
            <strong>{connectedPlayers}/{roomView.maxPlayers}</strong>
          </div>
          <div>
            <span class="meta-label">Ready</span>
            <strong>{readyPlayers}/{totalPlayers}</strong>
          </div>
          <div>
            <span class="meta-label">Created</span>
            <strong>{formatTime(roomView.createdAt)}</strong>
          </div>
        </div>

        <div class="table-state">
          <p>{roomView.status}</p>
          <p>{isHost ? 'You are the host.' : me ? 'You are at the table.' : 'Connect to take a seat.'}</p>
        </div>

        <ul class="players">
          {#each roomView.players as player (player.id)}
            <li class={`player-card ${player.connected ? 'connected' : 'away'}`}>
              <div class="avatar" aria-hidden="true">{player.name.slice(0, 2).toUpperCase()}</div>
              <div class="player-copy">
                <div class="player-line">
                  <strong>{player.name}</strong>
                  {#if player.id === mySessionId}
                    <span class="self">you</span>
                  {/if}
                  {#if player.id === roomView.hostId}
                    <span class="host">host</span>
                  {/if}
                </div>
                <p>{playerStatus(player)}</p>
              </div>
              <div class={`status-dot ${player.connected ? (player.ready ? 'ready' : 'live') : 'away'}`}></div>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="empty-state">
          <p>No active room yet.</p>
          <p>Create one or join by code to see the live table.</p>
        </div>
      {/if}
    </article>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    min-height: 100vh;
    color: rgba(244, 238, 224, 0.96);
    background:
      radial-gradient(circle at top, rgba(138, 104, 52, 0.28), transparent 32%),
      radial-gradient(circle at 20% 20%, rgba(110, 176, 124, 0.16), transparent 18%),
      linear-gradient(180deg, #0c1813 0%, #06100b 100%);
    font-family: ui-serif, Georgia, 'Times New Roman', serif;
  }

  :global(html) {
    background: #06100b;
  }

  .shell {
    position: relative;
    min-height: 100vh;
    padding: 2rem;
    overflow: hidden;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
    background-size: 42px 42px;
    mask-image: radial-gradient(circle at center, black 40%, transparent 95%);
    pointer-events: none;
  }

  .panel {
    position: relative;
    border: 1px solid rgba(243, 226, 186, 0.14);
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(16, 31, 24, 0.88), rgba(9, 18, 14, 0.92));
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(14px);
  }

  .hero {
    padding: 1.5rem 1.5rem 1.35rem;
    max-width: 76rem;
    margin: 0 auto 1.25rem;
  }

  .hero-grid {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: minmax(0, 1.8fr) minmax(18rem, 0.9fr);
    align-items: end;
  }

  h1,
  h2,
  strong {
    letter-spacing: 0.01em;
  }

  h1 {
    margin: 0.1rem 0 0.65rem;
    font-size: clamp(2.8rem, 6vw, 5.5rem);
    line-height: 0.95;
    text-wrap: balance;
  }

  h2 {
    margin: 0.2rem 0 0;
    font-size: 1.1rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: rgba(244, 238, 224, 0.8);
  }

  .lede {
    margin: 0;
    max-width: 44rem;
    font-size: clamp(1.05rem, 2vw, 1.25rem);
    line-height: 1.65;
    color: rgba(244, 238, 224, 0.78);
  }

  .eyebrow,
  .meta-label {
    display: block;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.72rem;
    color: rgba(243, 226, 186, 0.72);
  }

  .hero-meta {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border-radius: 20px;
    background: rgba(244, 238, 224, 0.04);
    border: 1px solid rgba(243, 226, 186, 0.1);
  }

  .hero-meta strong,
  .stats strong {
    display: block;
    margin-top: 0.25rem;
    font-size: 1rem;
    word-break: break-word;
  }

  .content-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(22rem, 1.2fr);
    gap: 1.25rem;
    max-width: 76rem;
    margin: 0 auto;
  }

  .controls,
  .table {
    padding: 1.25rem;
  }

  .controls header,
  .table header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  label {
    display: grid;
    gap: 0.45rem;
    margin-bottom: 0.9rem;
    font-size: 0.95rem;
    color: rgba(244, 238, 224, 0.88);
  }

  input {
    appearance: none;
    border: 1px solid rgba(243, 226, 186, 0.14);
    border-radius: 14px;
    background: rgba(6, 13, 10, 0.75);
    color: inherit;
    padding: 0.95rem 1rem;
    font: inherit;
    transition:
      border-color 120ms ease,
      transform 120ms ease,
      box-shadow 120ms ease;
  }

  input:focus {
    outline: none;
    border-color: rgba(243, 226, 186, 0.35);
    box-shadow: 0 0 0 4px rgba(243, 226, 186, 0.08);
  }

  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.4rem;
  }

  .button-row.compact {
    margin-top: 1rem;
  }

  button {
    border: 0;
    border-radius: 999px;
    padding: 0.92rem 1.1rem;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform 120ms ease,
      box-shadow 120ms ease,
      opacity 120ms ease,
      background 120ms ease;
  }

  button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .primary {
    color: #06100b;
    background: linear-gradient(180deg, #f4e9bd, #d5b66f);
    box-shadow: 0 12px 24px rgba(213, 182, 111, 0.24);
  }

  .secondary,
  .ghost,
  .copy {
    color: rgba(244, 238, 224, 0.94);
    background: rgba(244, 238, 224, 0.06);
    border: 1px solid rgba(243, 226, 186, 0.12);
  }

  .ghost {
    padding-inline: 1rem;
  }

  .copy {
    padding: 0.75rem 0.95rem;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 0.82rem;
  }

  .banner,
  .error {
    margin: 1rem 0 0;
    padding: 0.9rem 1rem;
    border-radius: 16px;
    line-height: 1.5;
  }

  .banner {
    border: 1px solid rgba(243, 226, 186, 0.1);
    background: rgba(243, 226, 186, 0.05);
  }

  .error {
    border: 1px solid rgba(224, 95, 95, 0.28);
    background: rgba(224, 95, 95, 0.1);
    color: #ffcece;
  }

  .pill {
    align-self: start;
    border-radius: 999px;
    border: 1px solid rgba(243, 226, 186, 0.14);
    padding: 0.45rem 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.7rem;
  }

  .pill.live {
    color: #bff7c7;
    background: rgba(69, 123, 81, 0.2);
  }

  .pill.connecting {
    color: #f7ebb6;
    background: rgba(160, 132, 54, 0.18);
  }

  .pill.error {
    color: #ffcece;
    background: rgba(224, 95, 95, 0.16);
  }

  .pill.idle {
    color: rgba(244, 238, 224, 0.72);
    background: rgba(244, 238, 224, 0.05);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
    padding: 1rem;
    border-radius: 20px;
    background: rgba(244, 238, 224, 0.04);
    border: 1px solid rgba(243, 226, 186, 0.1);
  }

  .table-state {
    margin: 1rem 0;
    padding: 1rem;
    border-radius: 20px;
    background: linear-gradient(180deg, rgba(243, 226, 186, 0.08), rgba(243, 226, 186, 0.03));
    border: 1px solid rgba(243, 226, 186, 0.1);
  }

  .table-state p {
    margin: 0;
    line-height: 1.6;
  }

  .table-state p + p {
    margin-top: 0.35rem;
    color: rgba(244, 238, 224, 0.78);
  }

  .players {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .player-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.9rem;
    padding: 0.9rem;
    border-radius: 18px;
    border: 1px solid rgba(243, 226, 186, 0.08);
    background: rgba(6, 13, 10, 0.6);
  }

  .player-card.connected {
    border-color: rgba(191, 247, 199, 0.14);
  }

  .player-card.away {
    opacity: 0.7;
  }

  .avatar {
    width: 2.75rem;
    height: 2.75rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #f4e9bd;
    background: radial-gradient(circle at top, rgba(244, 233, 189, 0.28), rgba(244, 233, 189, 0.08));
    border: 1px solid rgba(244, 233, 189, 0.14);
  }

  .player-copy {
    min-width: 0;
  }

  .player-line {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .player-copy strong {
    font-size: 1rem;
  }

  .player-copy p {
    margin: 0.25rem 0 0;
    color: rgba(244, 238, 224, 0.72);
  }

  .self,
  .host {
    border-radius: 999px;
    padding: 0.18rem 0.5rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .self {
    color: #06100b;
    background: #d5b66f;
  }

  .host {
    color: #f6e7ba;
    background: rgba(243, 226, 186, 0.1);
    border: 1px solid rgba(243, 226, 186, 0.14);
  }

  .status-dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 999px;
    box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.02);
  }

  .status-dot.live,
  .status-dot.ready {
    background: #8de0a0;
  }

  .status-dot.away {
    background: #a55f5f;
  }

  .empty-state {
    display: grid;
    gap: 0.35rem;
    padding: 1.2rem;
    min-height: 14rem;
    place-content: center;
    text-align: center;
    color: rgba(244, 238, 224, 0.76);
    border-radius: 20px;
    border: 1px dashed rgba(243, 226, 186, 0.16);
    background: rgba(6, 13, 10, 0.48);
  }

  .empty-state p {
    margin: 0;
  }

  @media (max-width: 900px) {
    .shell {
      padding: 1rem;
    }

    .hero-grid,
    .content-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
