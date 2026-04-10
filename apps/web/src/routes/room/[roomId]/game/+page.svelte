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

  $effect(() => {
    if (!roomId || session.roomView || session.connectionState === 'connecting') {
      return;
    }

    session.setRoomCode(roomId);
  });

  async function switchRoom() {
    if (!roomId) return;
    await session.switchRoom(roomId);
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
    content="Live game screen for The Gang. Track the board, confidence slots, and hidden cards as the hand progresses."
  />
</svelte:head>

<main class="shell room-shell">
  <div class="backdrop" aria-hidden="true"></div>

  <section class="hero panel">
    <div class="eyebrow">Game screen</div>
    <div class="hero-grid">
      <div>
        <h1>{roomId ?? 'Game'}</h1>
        <p class="lede">
          Read your hand, update your confidence, and follow the board through to showdown.
        </p>
      </div>

      <div class="hero-meta">
        <div>
          <span class="meta-label">Round</span>
          <strong>{session.roomView?.round ?? '—'}</strong>
        </div>
        <div>
          <span class="meta-label">Street</span>
          <strong>{session.roomView ? formatStreetLabel(session.roomView.street) : '—'}</strong>
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
          Leave the active room first if you want to switch to {roomId}. The game screen is reserved for connected players.
        </p>
      </div>

      <div class="button-row">
        <button type="button" class="primary" onclick={() => void switchRoom()}>
          Leave and join this room
        </button>
        <button type="button" class="secondary" onclick={() => void goto(`/room/${roomId}`)}>
          Back to lobby
        </button>
      </div>
    </section>
  {:else if !session.roomView}
    <section class="panel switch-card">
      <div>
        <span class="eyebrow">Reconnect needed</span>
        <h2>This room isn’t connected right now.</h2>
        <p>
          If you were part of the hand, the lobby will reconnect automatically when possible. Otherwise you can return to the lobby screen.
        </p>
      </div>

      <div class="button-row">
        <button type="button" class="primary" onclick={() => void goto(`/room/${roomId}`)}>
          Go to lobby
        </button>
        <button type="button" class="secondary" onclick={() => void goto('/')}>Back home</button>
      </div>
    </section>
  {:else}
    <section class="content-grid room-grid">
      <article class="panel controls room-actions">
        <header>
          <div>
            <span class="eyebrow">Table controls</span>
            <h2>Keep the hand moving</h2>
          </div>
          <span class={`pill ${session.connectionState}`}>{session.connectionState}</span>
        </header>

        <div class="button-row">
          <button type="button" class="secondary" onclick={() => void session.requestPrivateState()}>
            Sync my cards
          </button>
          <button type="button" class="ghost" onclick={() => void session.disconnect()}>
            Leave room
          </button>
        </div>

        <div class="button-row compact">
          {#if session.canResolveShowdown}
            <button type="button" class="ghost" onclick={() => void session.resolveShowdown()}>
              Resolve showdown
            </button>
          {:else}
            <button type="button" class="ghost" onclick={() => void session.advanceStreet()} disabled={!session.canAdvanceStreet}>
              {session.advanceStreetLabel}
            </button>
          {/if}

          {#if session.roomView?.phase === 'finished'}
            {#if session.roomView.campaignStatus === 'ongoing'}
              <button type="button" class="ghost" onclick={() => void session.dealNextHand()} disabled={!session.canDealNextHand}>
                Deal next hand
              </button>
            {:else}
              <button type="button" class="ghost" onclick={() => void session.restartRun()} disabled={!session.canRestartRun}>
                Restart run
              </button>
            {/if}
          {/if}
        </div>

        <p class="banner" aria-live="polite">{session.banner}</p>
        {#if session.errorMessage}
          <p class="error" aria-live="assertive">{session.errorMessage}</p>
        {/if}

        <div class="mini-summary">
          <div>
            <span class="meta-label">You are</span>
            <strong>{session.me?.name ?? '—'}</strong>
          </div>
          <div>
            <span class="meta-label">Claim</span>
            <strong>{session.me?.confidenceRank ? `#${session.me.confidenceRank}` : 'Unset'}</strong>
          </div>
          <div>
            <span class="meta-label">Finished</span>
            <strong>{formatTime(session.roomView?.finishedAt ?? 0)}</strong>
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
        tableSubline={session.roomView ? (session.isHost ? 'You are the host.' : session.me ? 'Read the board and lock your confidence.' : 'Watching the table.') : 'Waiting to reconnect…'}
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
