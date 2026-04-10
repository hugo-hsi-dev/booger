<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  import RoomTable from '$lib/RoomTable.svelte';
  import { getRoomSession } from '$lib/room-session-context';
  import {
    cardRank,
    cardSuitSymbol,
    cardTone,
    confidenceSlotTone,
    createBoardSlots,
    createConfidenceSlots,
    formatCampaignStatusLabel,
    formatStreetLabel,
    formatTime,
    playerStatus
  } from '$lib/room-ui';

  const session = getRoomSession();
  const roomId = $derived(page.params.roomId);
  const boardSlots = $derived(createBoardSlots(session.roomView?.communityCards ?? []));
  const confidenceSlots = $derived(createConfidenceSlots(session.totalPlayers));
  const hostName = $derived(
    session.roomView?.hostId === session.mySessionId
      ? 'You'
      : session.roomView?.players.find((player) => player.id === session.roomView?.hostId)?.name ?? '—'
  );

  $effect(() => {
    if (!roomId || session.roomView || session.connectionState === 'connecting') {
      return;
    }

    session.setRoomCode(roomId);
    void session.joinRoomFromRoute(roomId);
  });

  async function switchRoom() {
    if (!roomId) return;
    await session.switchRoom(roomId);
  }

  async function leaveAndGoHome() {
    await session.disconnect();
    await goto('/');
  }

  function saveName() {
    session.renamePlayer(session.playerName);
  }

  async function copyRoomCode() {
    if (!session.roomId) return;

    try {
      await navigator.clipboard.writeText(session.roomId);
      session.banner = 'Room code copied';
    } catch {
      session.banner = 'Copy failed';
    }
  }
</script>

<svelte:head>
  <title>{roomId ? `Lobby · ${roomId}` : 'Lobby · The Gang'}</title>
  <meta
    name="description"
    content="Lobby screen for The Gang. See who has joined, update your name, and get ready to start the game."
  />
</svelte:head>

<main class="shell room-shell">
  <div class="backdrop" aria-hidden="true"></div>

  <section class="hero panel">
    <div class="eyebrow">Lobby screen</div>
    <div class="hero-grid">
      <div>
        <h1>{roomId ?? 'Lobby'}</h1>
        <p class="lede">
          Get the table ready, make sure everyone is present, then mark ready to begin the hand.
        </p>
      </div>

      <div class="hero-meta">
        <div>
          <span class="meta-label">Room</span>
          <strong>{session.roomId ?? roomId ?? '—'}</strong>
        </div>
        <div>
          <span class="meta-label">Players</span>
          <strong>{session.connectedPlayers}/{session.roomView?.maxPlayers ?? '—'}</strong>
        </div>
        <div>
          <span class="meta-label">Status</span>
          <strong>{session.banner}</strong>
        </div>
      </div>
    </div>
  </section>

  {#if roomId && session.roomView && session.roomView.roomId !== roomId}
    <section class="panel switch-card">
      <div>
        <span class="eyebrow">Different room active</span>
        <h2>You’re currently in {session.roomView.roomId}</h2>
        <p>
          Leave the active room first if you want to switch to {roomId}. Your saved reconnect token stays local to this browser.
        </p>
      </div>

      <div class="button-row">
        <button type="button" class="primary" onclick={() => void switchRoom()}>
          Leave and join this room
        </button>
        <button type="button" class="secondary" onclick={() => void leaveAndGoHome()}>Back home</button>
      </div>
    </section>
  {:else}
    <section class="content-grid room-grid">
      <article class="panel controls room-actions">
        <header>
          <div>
            <span class="eyebrow">Lobby controls</span>
            <h2>Set your name, then ready up</h2>
          </div>
          <span class={`pill ${session.connectionState}`}>{session.connectionState}</span>
        </header>

        <label>
          Display name
          <input bind:value={session.playerName} maxlength="24" placeholder="Your name" />
        </label>

        <div class="button-row">
          <button type="button" class="secondary" onclick={saveName} disabled={!session.roomView || !session.playerName.trim()}>
            Save name
          </button>
          <button type="button" class="ghost" onclick={() => void session.disconnect()}>
            Leave room
          </button>
        </div>

        <div class="button-row compact">
          <button type="button" class="ghost" onclick={() => void session.toggleReady()} disabled={!session.roomView || !session.me}>
            {session.me?.ready ? 'Mark unready' : 'Mark ready'}
          </button>
          <button type="button" class="ghost" onclick={() => void session.startGame()} disabled={!session.canStart}>
            Start game
          </button>
        </div>

        <p class="banner" aria-live="polite">{session.banner}</p>
        {#if session.errorMessage}
          <p class="error" aria-live="assertive">{session.errorMessage}</p>
        {/if}

        <div class="mini-summary">
          <div>
            <span class="meta-label">Ready</span>
            <strong>{session.readyPlayers}/{session.totalPlayers}</strong>
          </div>
          <div>
            <span class="meta-label">Host</span>
            <strong>{hostName}</strong>
          </div>
          <div>
            <span class="meta-label">Created</span>
            <strong>{formatTime(session.roomView?.createdAt ?? 0)}</strong>
          </div>
        </div>
      </article>

      <RoomTable
        roomView={session.roomView}
        me={session.me}
        mySessionId={session.mySessionId}
        totalPlayers={session.totalPlayers}
        connectedPlayers={session.connectedPlayers}
        readyPlayers={session.readyPlayers}
        hasHandView={session.hasHandView}
        holeCards={session.holeCards}
        boardSlots={boardSlots}
        confidenceSlots={confidenceSlots}
        tableSubline={session.roomView ? (session.isHost ? 'You are the host.' : session.me ? 'You are at the table.' : 'Waiting for the room to fill.') : 'Joining lobby…'}
        formatStreetLabel={formatStreetLabel}
        formatCampaignStatusLabel={formatCampaignStatusLabel}
        formatTime={formatTime}
        playerStatus={(player) => playerStatus(player, session.roomView?.phase)}
        confidenceSlotOwner={(rank) => session.roomView?.players.find((player) => player.confidenceRank === rank) ?? null}
        cardRank={cardRank}
        cardSuitSymbol={cardSuitSymbol}
        cardTone={cardTone}
        confidenceSlotTone={(rank, owner) => confidenceSlotTone(rank, owner, session.mySessionId)}
        copyRoomCode={copyRoomCode}
        requestPrivateState={() => session.requestPrivateState()}
        claimConfidenceRank={(rank) => session.claimConfidenceRank(rank)}
        clearConfidenceRank={() => session.clearConfidenceRank()}
      />
    </section>
  {/if}
</main>
