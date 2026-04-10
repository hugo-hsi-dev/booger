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
    type CampaignStatus,
    type CardCode,
    type CardSuit,
    type GameOutcome,
    type GameRoomClient,
    type PlayerView,
    type PrivateStateMessage,
    type RoomView,
    type TableStreet
  } from '$lib/game-client';
  import './room-dashboard.css';
  import RoomControls from './RoomControls.svelte';
  import RoomTable from './RoomTable.svelte';

  type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
  type LobbyActionMessage = {
    type: 'set-ready' | 'start-game';
    ready?: boolean;
  };
  type TableActionMessage = {
    type:
      | 'advance-street'
      | 'resolve-showdown'
      | 'restart-run'
      | 'set-confidence'
      | 'next-hand'
      | 'sync-private-state';
    confidenceRank?: number | null;
  };
  type SavedRoomSession = {
    endpoint: string;
    playerName: string;
    roomId: string;
    reconnectionToken: string;
  };

  const endpoint = getServerEndpoint();
  const endpointLabel = endpoint || 'Auto-detected in browser';
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
  let hasHandView = $derived(Boolean(roomView && roomView.phase !== 'lobby'));
  let isPlaying = $derived(roomView?.phase === 'playing');
  let isFinished = $derived(roomView?.phase === 'finished');
  let holeCards = $derived(privateState?.holeCards ?? []);
  let boardSlots = $derived.by(() =>
    Array.from({ length: 5 }, (_, index) => roomView?.communityCards[index] ?? null)
  );
  let confidenceSlots = $derived.by(() => Array.from({ length: totalPlayers }, (_, index) => index + 1));
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
  let canResolveShowdown = $derived(
    Boolean(
      roomView &&
        roomView.phase === 'playing' &&
        roomView.street === 'showdown' &&
        isHost &&
        roomView.players.every((player) => player.confidenceRank !== null)
    )
  );
  let canDealNextHand = $derived(
    Boolean(
      roomView &&
        roomView.phase === 'finished' &&
        roomView.campaignStatus === 'ongoing' &&
        isHost &&
        roomView.players.length >= 2 &&
        roomView.players.every((player) => player.connected)
    )
  );
  let canRestartRun = $derived(Boolean(roomView && roomView.phase === 'finished' && isHost));
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
        : roomView.phase === 'playing'
          ? isHost
            ? 'Guide the team through each street and resolve the hand at showdown.'
            : me
              ? 'Read your cards, claim a confidence slot, and adjust as the board develops.'
              : 'Spectating the live table.'
          : roomView.campaignStatus === 'won'
            ? 'The crew completed the run. Restart to play another series.'
            : roomView.campaignStatus === 'lost'
              ? 'The alarm track filled up. Restart to begin a fresh run.'
              : isHost
                ? 'The hand is scored. Deal the next hand when everyone is ready.'
                : 'Waiting for the host to deal the next hand.'
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

      if (state.phase === 'lobby') {
        privateState = null;
        return;
      }

      if (!privateState?.holeCards.length || previousPhase !== state.phase) {
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

    if (nextRoom.state.phase !== 'lobby') {
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

  function resolveShowdown() {
    sendTableAction({ type: 'resolve-showdown' });
  }

  function dealNextHand() {
    sendTableAction({ type: 'next-hand' });
  }

  function restartRun() {
    sendTableAction({ type: 'restart-run' });
  }

  function claimConfidenceRank(confidenceRank: number) {
    if (roomView?.phase !== 'playing') return;
    sendTableAction({ type: 'set-confidence', confidenceRank });
  }

  function clearConfidenceRank() {
    if (roomView?.phase !== 'playing') return;
    sendTableAction({ type: 'set-confidence', confidenceRank: null });
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

  function formatOutcomeLabel(outcome: GameOutcome) {
    switch (outcome) {
      case 'success':
        return 'Matched';
      case 'failure':
        return 'Missed';
      default:
        return 'Pending';
    }
  }

  function formatCampaignStatusLabel(status: CampaignStatus) {
    switch (status) {
      case 'won':
        return 'Run won';
      case 'lost':
        return 'Run lost';
      default:
        return 'Run active';
    }
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
      return roomView?.phase === 'lobby' ? 'Away' : 'Disconnected mid-hand';
    }

    if (roomView?.phase === 'finished') {
      return player.handLabel ?? 'Showdown complete';
    }

    if (roomView?.phase === 'playing') {
      if (player.confidenceRank !== null) {
        return `Claimed confidence slot #${player.confidenceRank}`;
      }

      return player.holeCardCount > 0 ? 'Still choosing confidence' : 'Waiting for the deal';
    }

    return player.ready ? 'Ready' : 'Waiting';
  }

  function confidenceSlotOwner(rank: number) {
    return roomView?.players.find((player) => player.confidenceRank === rank) ?? null;
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

  function confidenceSlotTone(rank: number, owner: PlayerView | null) {
    if (owner?.id === mySessionId) return 'mine';
    if (owner) return 'claimed';
    return 'open';
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
    content="A digital tabletop for The Gang, with realtime lobby sync, private cards, confidence ordering, and server-authoritative showdown resolution."
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
          <strong>{endpointLabel}</strong>
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
    <RoomControls
      bind:playerName
      bind:roomCode
      connectionState={connectionState}
      connectionLabel={connectionLabel}
      roomView={roomView}
      me={me}
      canStart={canStart}
      canAdvanceStreet={canAdvanceStreet}
      canResolveShowdown={canResolveShowdown}
      canDealNextHand={canDealNextHand}
      canRestartRun={canRestartRun}
      advanceStreetLabel={advanceStreetLabel}
      banner={banner}
      errorMessage={errorMessage}
      formatStreetLabel={formatStreetLabel}
      formatCampaignStatusLabel={formatCampaignStatusLabel}
      formatTime={formatTime}
      connect={connect}
      disconnect={disconnect}
      toggleReady={toggleReady}
      startGame={startGame}
      requestPrivateState={requestPrivateState}
      resolveShowdown={resolveShowdown}
      advanceStreet={advanceStreet}
      dealNextHand={dealNextHand}
      restartRun={restartRun}
    />

    <RoomTable
      roomView={roomView}
      me={me}
      mySessionId={mySessionId}
      totalPlayers={totalPlayers}
      connectedPlayers={connectedPlayers}
      readyPlayers={readyPlayers}
      hasHandView={hasHandView}
      holeCards={holeCards}
      boardSlots={boardSlots}
      confidenceSlots={confidenceSlots}
      tableSubline={tableSubline}
      formatStreetLabel={formatStreetLabel}
      formatCampaignStatusLabel={formatCampaignStatusLabel}
      formatTime={formatTime}
      playerStatus={playerStatus}
      confidenceSlotOwner={confidenceSlotOwner}
      cardRank={cardRank}
      cardSuitSymbol={cardSuitSymbol}
      cardTone={cardTone}
      confidenceSlotTone={confidenceSlotTone}
      copyRoomCode={copyRoomCode}
      requestPrivateState={requestPrivateState}
      claimConfidenceRank={claimConfidenceRank}
      clearConfidenceRank={clearConfidenceRank}
    />
  </section>
</main>

