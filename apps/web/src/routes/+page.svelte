<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import {
    createGameClient,
    createRoom,
    getServerEndpoint,
    joinRoom,
    PRIVATE_STATE_MESSAGE,
    reconnectRoom,
    ROOM_NAME,
    TABLE_ACTION_MESSAGE,
    toRoomView,
    type CardCode,
    type CardSuit,
    type GameRoomClient,
    type PlayerView,
    type PrivateStateMessage,
    type RoomView,
    type TableStreet
  } from '$lib/game-client';

  type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
  type LobbyActionMessage = {
    type: 'set-ready' | 'start-game';
    ready?: boolean;
  };
  type TableActionMessage = {
    type: 'advance-street' | 'sync-private-state';
  };
  type SavedRoomSession = {
    endpoint: string;
    playerName: string;
    roomId: string;
    reconnectionToken: string;
  };

  const endpoint = getServerEndpoint();
  const SESSION_STORAGE_KEY = 'booger:lobby-session';
  const SUIT_SYMBOLS: Record<CardSuit, string> = {
    S: '♠',
    H: '♥',
    D: '♦',
    C: '♣'
  };

  let playerName = $state('Player');
  let roomCode = $state('');
  let connectionState = $state<ConnectionState>('idle');
  let banner = $state('Create a room or join with a code.');
  let errorMessage = $state('');
  let mySessionId = $state('');
  let roomView = $state<RoomView | null>(null);
  let privateState = $state<PrivateStateMessage | null>(null);
  let isPageUnloading = false;

  let client = $state.raw<ReturnType<typeof createGameClient> | null>(null);
  let room = $state.raw<GameRoomClient | null>(null);

  let totalPlayers = $derived(roomView?.players.length ?? 0);
  let connectedPlayers = $derived(roomView?.players.filter((player) => player.connected).length ?? 0);
  let readyPlayers = $derived(roomView?.players.filter((player) => player.ready).length ?? 0);
  let me = $derived(roomView?.players.find((player) => player.id === mySessionId) ?? null);
  let isHost = $derived(Boolean(roomView && mySessionId && roomView.hostId === mySessionId));
  let isPlaying = $derived(roomView?.phase === 'playing');
  let holeCards = $derived(privateState?.holeCards ?? []);
  let boardSlots = $derived.by(() =>
    Array.from({ length: 5 }, (_, index) => roomView?.communityCards[index] ?? null)
  );
  let canStart = $derived(
    Boolean(
      roomView &&
        roomView.phase === 'lobby' &&
        isHost &&
        roomView.players.length >= 2 &&
        roomView.players.every((player) => player.connected && player.ready)
    )
  );
  let canAdvanceStreet = $derived(
    Boolean(roomView && roomView.phase === 'playing' && isHost && roomView.street !== 'showdown')
  );
  let advanceStreetLabel = $derived(roomView ? getAdvanceStreetLabel(roomView.street) : 'Advance street');
  let connectionLabel = $derived(
    connectionState === 'connecting'
      ? 'connecting'
      : connectionState === 'connected'
        ? 'live'
        : connectionState === 'error'
          ? 'error'
          : 'idle'
  );
  let tableSubline = $derived(
    !roomView
      ? 'Connect to take a seat.'
      : roomView.phase === 'lobby'
        ? isHost
          ? 'You are the host.'
          : me
            ? 'You are at the table.'
            : 'Connect to take a seat.'
        : isHost
          ? 'You are pacing the table. Reveal each street when the team is ready.'
          : me
            ? 'Read your private hand, watch the shared board, and coordinate confidence.'
            : 'Spectating the live table.'
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
    privateState = null;
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

  function sendLobbyAction(action: LobbyActionMessage) {
    room?.send('lobby-action', action);
  }

  function sendTableAction(action: TableActionMessage, targetRoom: GameRoomClient | null = room) {
    targetRoom?.send(TABLE_ACTION_MESSAGE, action);
  }

  function requestPrivateState(targetRoom: GameRoomClient | null = room) {
    sendTableAction({ type: 'sync-private-state' }, targetRoom);
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

    nextRoom.onMessage<PrivateStateMessage>(PRIVATE_STATE_MESSAGE, (message) => {
      privateState = {
        holeCards: [...(message.holeCards ?? [])],
        round: message.round,
        street: message.street
      };
    });

    nextRoom.onStateChange((state) => {
      const previousPhase = roomView?.phase;
      setSnapshot(state);
      persistSession(nextRoom);

      if (state.phase === 'playing' && previousPhase !== 'playing') {
        requestPrivateState(nextRoom);
      }
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

    if (nextRoom.state.phase === 'playing') {
      requestPrivateState(nextRoom);
    }
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

  function toggleReady() {
    sendLobbyAction({ type: 'set-ready', ready: !(me?.ready ?? false) });
  }

  function startGame() {
    sendLobbyAction({ type: 'start-game' });
  }

  function advanceStreet() {
    sendTableAction({ type: 'advance-street' });
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

  function formatStreetLabel(street: TableStreet) {
    return street
      .split('-')
      .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function getAdvanceStreetLabel(street: TableStreet) {
    switch (street) {
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

  function playerStatus(player: PlayerView) {
    if (!player.connected) {
      return roomView?.phase === 'playing' ? 'Disconnected mid-hand' : 'Away';
    }

    if (roomView?.phase === 'playing') {
      return player.holeCardCount > 0
        ? `${player.holeCardCount} private ${player.holeCardCount === 1 ? 'card' : 'cards'}`
        : 'Waiting for the deal';
    }

    return player.ready ? 'Ready' : 'Waiting';
  }

  function cardRank(card: CardCode) {
    const rank = card.slice(0, -1);
    return rank === 'T' ? '10' : rank;
  }

  function cardSuit(card: CardCode) {
    return card.slice(-1) as CardSuit;
  }

  function cardSuitSymbol(card: CardCode) {
    return SUIT_SYMBOLS[cardSuit(card)];
  }

  function isRedCard(card: CardCode) {
    const suit = cardSuit(card);
    return suit === 'H' || suit === 'D';
  }

  function cardTone(card: CardCode | null) {
    if (!card) return 'hidden';
    return isRedCard(card) ? 'red' : 'dark';
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
    content="A digital tabletop for The Gang, with realtime lobby sync, private cards, and server-authoritative play state."
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

        {#if roomView?.phase === 'playing'}
          <button type="button" class="ghost" onclick={() => requestPrivateState()} disabled={!roomView}>
            Sync my cards
          </button>
          <button type="button" class="ghost" onclick={advanceStreet} disabled={!canAdvanceStreet}>
            {advanceStreetLabel}
          </button>
        {:else}
          <button type="button" class="ghost" onclick={() => void toggleReady()} disabled={!roomView || !me || roomView.phase !== 'lobby'}>
            {me?.ready ? 'Mark unready' : 'Mark ready'}
          </button>
          <button type="button" class="ghost" onclick={startGame} disabled={!canStart}>
            Start game
          </button>
        {/if}
      </div>

      {#if roomView?.phase === 'playing'}
        <div class="play-brief">
          <div>
            <span class="meta-label">Round</span>
            <strong>{roomView.round}</strong>
          </div>
          <div>
            <span class="meta-label">Street</span>
            <strong>{formatStreetLabel(roomView.street)}</strong>
          </div>
          <div>
            <span class="meta-label">Your cards</span>
            <strong>{holeCards.length}/2</strong>
          </div>
        </div>
      {/if}

      <p class="banner" aria-live="polite">{banner}</p>
      {#if errorMessage}
        <p class="error" aria-live="assertive">{errorMessage}</p>
      {/if}
    </article>

    <article class="panel table">
      <header>
        <div>
          <span class="eyebrow">Live table</span>
          <h2>{roomView?.phase === 'playing' ? 'Co-op poker hand' : 'Room snapshot'}</h2>
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

          {#if roomView.phase === 'playing'}
            <div>
              <span class="meta-label">Street</span>
              <strong>{formatStreetLabel(roomView.street)}</strong>
            </div>
            <div>
              <span class="meta-label">Round</span>
              <strong>{roomView.round}</strong>
            </div>
          {:else}
            <div>
              <span class="meta-label">Ready</span>
              <strong>{readyPlayers}/{totalPlayers}</strong>
            </div>
            <div>
              <span class="meta-label">Created</span>
              <strong>{formatTime(roomView.createdAt)}</strong>
            </div>
          {/if}
        </div>

        <div class="table-state">
          <p>{roomView.status}</p>
          <p>{tableSubline}</p>
        </div>

        {#if roomView.phase === 'playing'}
          <section class="board panel-surface">
            <div class="surface-header">
              <div>
                <span class="eyebrow">Shared board</span>
                <h3>{formatStreetLabel(roomView.street)}</h3>
              </div>
              <div class="street-meta">
                <span>Dealer seat {roomView.dealerSeat === null ? '—' : roomView.dealerSeat + 1}</span>
                <span>{roomView.communityCards.length}/5 community cards</span>
              </div>
            </div>

            <div class="community-cards" role="list" aria-label="Community cards">
              {#each boardSlots as card, index (index)}
                <div class={`table-card ${cardTone(card)}`} role="listitem" aria-label={card ? `${cardRank(card)} of ${cardSuitSymbol(card)}` : 'Hidden community card'}>
                  {#if card}
                    <span class="card-rank">{cardRank(card)}</span>
                    <span class="card-suit">{cardSuitSymbol(card)}</span>
                  {:else}
                    <span class="card-back" aria-hidden="true">◆</span>
                  {/if}
                </div>
              {/each}
            </div>
          </section>

          <section class="private-hand panel-surface">
            <div class="surface-header">
              <div>
                <span class="eyebrow">Your hidden hand</span>
                <h3>{me ? `${me.name}'s cards` : 'Private cards'}</h3>
              </div>
              <div class="street-meta">
                <span>{holeCards.length > 0 ? 'Only visible to you' : 'Waiting for server sync'}</span>
              </div>
            </div>

            {#if holeCards.length > 0}
              <div class="hole-cards" role="list" aria-label="Your private cards">
                {#each holeCards as card, index (`${card}-${index}`)}
                  <div class={`table-card large ${cardTone(card)}`} role="listitem" aria-label={`${cardRank(card)} of ${cardSuitSymbol(card)}`}>
                    <span class="card-rank">{cardRank(card)}</span>
                    <span class="card-suit">{cardSuitSymbol(card)}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="private-empty">
                <p>Your private cards are requested separately from the public room state.</p>
                <button type="button" class="secondary" onclick={() => requestPrivateState()}>
                  Sync my cards
                </button>
              </div>
            {/if}
          </section>
        {/if}

        <ul class="players">
          {#each roomView.players as player (player.id)}
            <li class={`player-card ${player.connected ? 'connected' : 'away'} ${player.id === mySessionId ? 'self-card' : ''}`}>
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
                  {#if roomView.phase === 'playing'}
                    <span class="seat-tag">seat {player.seat + 1}</span>
                    {#if roomView.dealerSeat === player.seat}
                      <span class="role-tag dealer">dealer</span>
                    {/if}
                    {#if roomView.activeSeat === player.seat}
                      <span class="role-tag action">action</span>
                    {/if}
                  {/if}
                </div>
                <p>{playerStatus(player)}</p>
              </div>
              <div class="status-stack">
                {#if roomView.phase === 'playing'}
                  <span class="card-count">{player.holeCardCount}</span>
                {/if}
                <div class={`status-dot ${player.connected ? (roomView.phase === 'lobby' ? (player.ready ? 'ready' : 'live') : 'live') : 'away'}`}></div>
              </div>
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

  .panel-surface {
    border-radius: 22px;
    border: 1px solid rgba(243, 226, 186, 0.1);
    background: linear-gradient(180deg, rgba(19, 44, 31, 0.88), rgba(10, 24, 18, 0.92));
    padding: 1rem;
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
  h3,
  strong {
    letter-spacing: 0.01em;
  }

  h1 {
    margin: 0.1rem 0 0.65rem;
    font-size: clamp(2.8rem, 6vw, 5.5rem);
    line-height: 0.95;
    text-wrap: balance;
  }

  h2,
  h3 {
    margin: 0.2rem 0 0;
    font-size: 1.1rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: rgba(244, 238, 224, 0.8);
  }

  h3 {
    font-size: 0.92rem;
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
  .stats strong,
  .play-brief strong {
    display: block;
    margin-top: 0.25rem;
    font-size: 1rem;
    word-break: break-word;
  }

  .content-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(22rem, 1.25fr);
    gap: 1.25rem;
    max-width: 76rem;
    margin: 0 auto;
  }

  .controls,
  .table {
    padding: 1.25rem;
  }

  .controls header,
  .table header,
  .surface-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }

  .controls header,
  .table header {
    margin-bottom: 1rem;
  }

  .surface-header {
    margin-bottom: 0.9rem;
  }

  .street-meta {
    display: grid;
    gap: 0.35rem;
    justify-items: end;
    text-align: right;
    color: rgba(244, 238, 224, 0.68);
    font-size: 0.82rem;
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

  .play-brief,
  .banner,
  .error {
    margin: 1rem 0 0;
    padding: 0.9rem 1rem;
    border-radius: 16px;
    line-height: 1.5;
  }

  .play-brief {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    border: 1px solid rgba(143, 208, 155, 0.12);
    background: linear-gradient(180deg, rgba(38, 72, 51, 0.28), rgba(22, 46, 31, 0.28));
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

  .board,
  .private-hand {
    margin-bottom: 1rem;
  }

  .community-cards,
  .hole-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(4.5rem, 1fr));
    gap: 0.8rem;
  }

  .table-card {
    position: relative;
    min-height: 6.1rem;
    border-radius: 20px;
    border: 1px solid rgba(243, 226, 186, 0.14);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0.9rem 0.85rem;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .table-card.large {
    min-height: 8.2rem;
  }

  .table-card.dark {
    color: #0b1712;
    background: linear-gradient(180deg, #f5efde, #dbcdb2);
  }

  .table-card.red {
    color: #7b1f1f;
    background: linear-gradient(180deg, #f8e6de, #e7c0b8);
  }

  .table-card.hidden {
    display: grid;
    place-items: center;
    color: rgba(244, 238, 224, 0.4);
    background:
      linear-gradient(135deg, rgba(244, 238, 224, 0.06), rgba(244, 238, 224, 0.02)),
      repeating-linear-gradient(135deg, rgba(244, 238, 224, 0.05), rgba(244, 238, 224, 0.05) 10px, transparent 10px, transparent 20px);
  }

  .card-rank {
    font-size: 1.75rem;
    line-height: 1;
    font-weight: 800;
  }

  .card-suit {
    justify-self: end;
    align-self: end;
    font-size: 1.5rem;
    line-height: 1;
    font-weight: 700;
  }

  .card-back {
    font-size: 1.65rem;
    line-height: 1;
    opacity: 0.75;
  }

  .private-empty {
    display: grid;
    gap: 0.8rem;
    align-items: center;
    justify-items: start;
    padding: 0.25rem 0 0.1rem;
  }

  .private-empty p {
    margin: 0;
    color: rgba(244, 238, 224, 0.74);
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

  .player-card.self-card {
    background: linear-gradient(180deg, rgba(33, 55, 42, 0.72), rgba(11, 20, 15, 0.68));
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
  .host,
  .seat-tag,
  .role-tag {
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

  .seat-tag {
    color: rgba(244, 238, 224, 0.8);
    background: rgba(244, 238, 224, 0.06);
    border: 1px solid rgba(243, 226, 186, 0.1);
  }

  .role-tag.dealer {
    color: #06100b;
    background: #bfe7bf;
  }

  .role-tag.action {
    color: #06100b;
    background: #f4e9bd;
  }

  .status-stack {
    display: grid;
    justify-items: end;
    gap: 0.45rem;
  }

  .card-count {
    min-width: 1.8rem;
    height: 1.8rem;
    display: grid;
    place-items: center;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 800;
    color: #06100b;
    background: #f4e9bd;
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

  @media (max-width: 640px) {
    .play-brief,
    .stats {
      grid-template-columns: 1fr 1fr;
    }

    .community-cards,
    .hole-cards {
      grid-template-columns: repeat(auto-fit, minmax(4rem, 1fr));
    }

    .table-card {
      min-height: 5.4rem;
      padding: 0.7rem;
    }

    .table-card.large {
      min-height: 7rem;
    }
  }
</style>
