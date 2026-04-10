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
  const tableSubline = $derived(
    !session.roomView
      ? 'Connecting to the live game…'
      : session.roomView.phase === 'playing'
        ? session.isHost
          ? 'Advance the streets, keep everyone synced, and resolve the showdown once all confidence slots are claimed.'
          : 'Study your cards, claim a confidence slot, and compare the reveal once the showdown resolves.'
        : session.roomView.phase === 'finished'
          ? session.roomView.campaignStatus === 'ongoing'
            ? session.isHost
              ? 'The hand is complete. Deal the next hand once the table is ready.'
              : 'The hand is complete. Wait for the host to deal the next hand.'
            : session.roomView.campaignStatus === 'won'
              ? 'The crew completed the run. Restart when you want to play again.'
              : 'The run ended on the alarm track. Restart to begin a fresh run.'
          : 'Waiting in the lobby…'
  );

  $effect(() => {
    if (!roomId) {
      return;
    }

    session.ensureJoinedRoom(roomId);
  });

  async function switchRoom() {
    if (!roomId) return;
    await session.switchRoom(roomId);
  }

  async function leaveAndGoHome() {
    await session.disconnect();
    await goto('/');
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
  <title>{roomId ? `Game · ${roomId}` : 'Game · The Gang'}</title>
  <meta
    name="description"
    content="Live game screen for The Gang. Track the board, rank confidence, and run each hand through showdown."
  />
</svelte:head>

<main class="shell room-shell game-shell">
  <div class="backdrop" aria-hidden="true"></div>

  <section class="hero panel">
    <div class="eyebrow">Game screen</div>
    <div class="hero-grid">
      <div>
        <h1>{roomId ?? 'Game'}</h1>
        <p class="lede">
          Follow the live hand, keep private cards synced, and coordinate the confidence order as the board develops.
        </p>
      </div>

      <div class="hero-meta">
        <div>
          <span class="meta-label">Room</span>
          <strong>{session.roomId ?? roomId ?? '—'}</strong>
        </div>
        <div>
          <span class="meta-label">Round</span>
          <strong>{session.roomView?.round ?? '—'}</strong>
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
          Leave the active room first if you want to switch to {roomId}. Your reconnect token stays local to this browser.
        </p>
      </div>

      <div class="button-row">
        <button type="button" class="primary" onclick={() => void switchRoom()}>
          Leave and join this room
        </button>
        <button type="button" class="secondary" onclick={() => void leaveAndGoHome()}>Back home</button>
      </div>
    </section>
  {:else if !session.roomView}
    <section class="panel switch-card">
      <div>
        <span class="eyebrow">Connecting</span>
        <h2>Joining the live game</h2>
        <p>
          If the room is still in the lobby, you’ll be redirected there automatically. If you were already in this hand, the session will try to reconnect.
        </p>
      </div>

      <p class="banner" aria-live="polite">{session.banner}</p>
      {#if session.errorMessage}
        <p class="error" aria-live="assertive">{session.errorMessage}</p>
      {/if}

      <div class="button-row">
        <button type="button" class="secondary" onclick={() => void goto(`/room/${roomId}`)}>
          Go to lobby
        </button>
        <button type="button" class="ghost" onclick={() => void goto('/')}>Back home</button>
      </div>
    </section>
  {:else}
    <section class="content-grid room-grid">
      <article class="panel controls room-actions">
        <header>
          <div>
            <span class="eyebrow">Game controls</span>
            <h2>Run the hand and keep your view in sync</h2>
          </div>
          <span class={`pill ${session.connectionState}`}>{session.connectionState}</span>
        </header>

        <div class="mini-summary">
          <div>
            <span class="meta-label">Host</span>
            <strong>{hostName}</strong>
          </div>
          <div>
            <span class="meta-label">Street</span>
            <strong>{formatStreetLabel(session.roomView.street)}</strong>
          </div>
          <div>
            <span class="meta-label">Finished</span>
            <strong>{formatTime(session.roomView.finishedAt)}</strong>
          </div>
        </div>

        <div class="button-row compact">
          <button type="button" class="secondary" onclick={() => void copyRoomCode()}>
            Copy room code
          </button>
          <button type="button" class="ghost" onclick={() => session.requestPrivateState()}>
            Sync my cards
          </button>
          <button type="button" class="ghost" onclick={() => void session.disconnect()}>
            Leave room
          </button>
        </div>

        {#if session.isHost}
          <div class="play-brief">
            <div>
              <span class="meta-label">Progress</span>
              <strong>{session.roomView.successfulHands}/{session.roomView.targetSuccesses}</strong>
            </div>
            <div>
              <span class="meta-label">Alarms</span>
              <strong>{session.roomView.failedHands}/{session.roomView.maxFailures}</strong>
            </div>
            <div>
              <span class="meta-label">Your role</span>
              <strong>Host</strong>
            </div>
          </div>

          <div class="button-row compact">
            {#if session.canResolveShowdown}
              <button type="button" class="primary" onclick={() => session.resolveShowdown()}>
                Resolve showdown
              </button>
            {:else if session.canAdvanceStreet}
              <button type="button" class="primary" onclick={() => session.advanceStreet()}>
                {session.advanceStreetLabel}
              </button>
            {/if}

            {#if session.canDealNextHand}
              <button type="button" class="ghost" onclick={() => session.dealNextHand()}>
                Deal next hand
              </button>
            {/if}

            {#if session.canRestartRun}
              <button type="button" class="ghost" onclick={() => session.restartRun()}>
                Restart run
              </button>
            {/if}
          </div>
        {/if}

        <p class="banner" aria-live="polite">{session.banner}</p>
        {#if session.errorMessage}
          <p class="error" aria-live="assertive">{session.errorMessage}</p>
        {/if}
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
        tableSubline={tableSubline}
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
