<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  import {
    cardRank,
    cardSuitSymbol,
    createBoardSlots,
    createConfidenceSlots,
    formatCampaignStatusLabel,
    formatStreetLabel,
    formatTime,
    isRedCard,
    playerStatus
  } from '$lib/room-ui';
  import type { CardCode } from '$lib/game-client';
  import { getRoomSession } from '$lib/room-session-context';

  const session = getRoomSession();
  const roomId = $derived(page.params.roomId);
  const room = $derived(session.roomView);
  const me = $derived(session.me);
  const hasHand = $derived(session.hasHandView);
  const isPlaying = $derived(room?.phase === 'playing');
  const boardSlots = $derived(createBoardSlots(session.roomView?.communityCards ?? []));
  const confidenceSlots = $derived(createConfidenceSlots(session.totalPlayers));

  let showSettings = $state(false);
  let showPlayerDrawer = $state(false);
  let showConfirmModal = $state(false);
  let showSwapModal = $state(true);
  let swapDismissed = $state(false);

  // Derived UI substate
  const phase = $derived(room?.phase);
  const street = $derived(room?.street);
  const campaignStatus = $derived(room?.campaignStatus);
  const outcome = $derived(room?.outcome);
  const connectedPlayers = $derived(room?.players.filter((p) => p.connected) ?? []);
  const allRanked = $derived(connectedPlayers.length > 0 && connectedPlayers.every((p) => p.confidenceRank !== null));
  const myRank = $derived(me?.confidenceRank ?? null);

  // Show confirmation modal when all connected players have ranks
  // (In the future, this will be driven by server-side confirmation state)
  $effect(() => {
    if (phase === 'playing' && myRank !== null && allRanked && street !== 'pre-flop') {
      showConfirmModal = true;
    } else {
      showConfirmModal = false;
    }
  });

  /** Confidence slot owner lookup */
  function slotOwner(rank: number) {
    return room?.players.find((p) => p.confidenceRank === rank) ?? null;
  }

  /** Red/black suit color for a revealed card */
  function suitColor(card: CardCode) {
    return isRedCard(card) ? '#dc2626' : '#1e293b';
  }

  $effect(() => {
    if (!roomId || session.roomView || session.connectionState === 'connecting') return;
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
    content="Live game screen for The Gang. Track the board, rank your confidence, and follow the hand to showdown."
  />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

{#if roomId && session.roomView && session.roomView.roomId !== roomId}
  <!-- ─── WRONG ROOM ─── -->
  <div class="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-terra-page to-terra-alt font-sans text-terra-ink">
    <div class="max-w-md w-full p-8 rounded-3xl bg-terra-surface shadow-2xl border border-terra-edge text-center">
      <div class="text-4xl mb-3">🔒</div>
      <h2 class="text-xl font-bold text-terra-ink mb-2">Different room active</h2>
      <p class="text-sm text-terra-muted leading-relaxed mb-6">
        You're currently in <strong>{session.roomView.roomId}</strong>. Leave that room first to
        switch to <strong>{roomId}</strong>.
      </p>
      <div class="flex flex-col gap-2">
        <button type="button" class="w-full px-4 py-3 rounded-xl bg-terra-accent hover:bg-orange-500 text-white text-sm font-bold transition-colors border-none cursor-pointer shadow-lg shadow-orange-300/30" onclick={() => void switchRoom()}>
          Leave and join this room
        </button>
        <button type="button" class="w-full px-4 py-3 rounded-xl bg-terra-surface hover:bg-terra-surface-2 text-terra-ink text-sm font-semibold transition-colors border border-terra-edge cursor-pointer" onclick={() => void goto(resolve(`/room/${roomId}`))}>
          Back to lobby
        </button>
      </div>
    </div>
  </div>
{:else if !session.roomView}
  <!-- ─── RECONNECT NEEDED ─── -->
  <div class="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-terra-page to-terra-alt font-sans text-terra-ink">
    <div class="max-w-md w-full p-8 rounded-3xl bg-terra-surface shadow-2xl border border-terra-edge text-center">
      <div class="text-4xl mb-3">📡</div>
      <h2 class="text-xl font-bold text-terra-ink mb-2">Reconnect needed</h2>
      <p class="text-sm text-terra-muted leading-relaxed mb-6">
        This room isn't connected right now. If you were part of the hand, the lobby will reconnect
        automatically when possible.
      </p>
      <div class="flex flex-col gap-2">
        <button type="button" class="w-full px-4 py-3 rounded-xl bg-terra-accent hover:bg-orange-500 text-white text-sm font-bold transition-colors border-none cursor-pointer shadow-lg shadow-orange-300/30" onclick={() => void goto(resolve(`/room/${roomId}`))}>
          Go to lobby
        </button>
        <button type="button" class="w-full px-4 py-3 rounded-xl bg-terra-surface hover:bg-terra-surface-2 text-terra-ink text-sm font-semibold transition-colors border border-terra-edge cursor-pointer" onclick={() => void goto(resolve('/') )}>Back home</button>
      </div>
    </div>
  </div>
{:else}
  <!-- ─── CONNECTED: GAME SCREEN ─── -->

  <!-- Top bar -->
  <header class="sticky top-0 z-40 flex items-center justify-between px-5 py-3 border-b border-terra-edge/60 bg-terra-page/80 backdrop-blur-md font-sans">
    <div class="flex items-center gap-3">
      <button
        type="button"
        aria-label="Open player roster"
        class="w-9 h-9 flex items-center justify-center rounded-xl bg-terra-surface-2 hover:bg-terra-surface-3 text-terra-muted hover:text-terra-ink transition-colors border-none cursor-pointer p-0"
        onclick={() => (showPlayerDrawer = true)}
      >
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div class="flex items-center gap-2 bg-terra-surface-2 rounded-full px-3 py-1">
        <span class="text-xs font-bold tracking-wide text-terra-accent font-display">R{room?.round ?? '—'}</span>
        <span class="w-1 h-1 rounded-full bg-terra-accent"></span>
        <span class="text-xs font-semibold text-terra-muted"> {room ? formatStreetLabel(room.street) : '—'}</span >
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        aria-label="Open settings"
        class="w-9 h-9 flex items-center justify-center rounded-xl bg-terra-surface-2 hover:bg-terra-surface-3 text-terra-muted hover:text-terra-ink transition-colors border-none cursor-pointer p-0"
        onclick={() => (showSettings = true)}
      >
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.58 2.25.34 2.573-1.066z"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <button type="button" aria-label="Copy room code" class="w-9 h-9 flex items-center justify-center rounded-xl bg-terra-surface-2 hover:bg-terra-surface-3 text-terra-muted hover:text-terra-ink transition-colors border-none cursor-pointer p-0" onclick={copyRoomCode}>
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      </button>
    </div>
  </header>

  <!-- Avatar strip -->
  <div class="flex items-center justify-center gap-3 px-4 py-3 border-b border-terra-edge/40 font-sans overflow-x-auto">
    {#each room?.players ?? [] as player (player.id)}
      {@const isSelf = player.id === session.mySessionId}
      {@const hasRank = player.confidenceRank !== null}
      <button
        type="button"
        aria-label="Open player roster"
        class="flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer p-0 transition-opacity font-sans opacity-100 hover:opacity-100 {player.connected ? '' : 'opacity-[0.35] grayscale'}"
        onclick={() => (showPlayerDrawer = true)}
      >
        <div class="relative w-12 h-12 rounded-2xl flex items-center justify-center bg-terra-surface-2 shadow-sm {isSelf ? 'ring-2 ring-terra-accent ring-offset-2 ring-offset-terra-page' : ''}">
          <span class="font-display text-sm font-bold text-terra-ink">{player.name.slice(0, 2).toUpperCase()}</span>
          <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-terra-page {player.connected ? 'bg-green-500' : 'bg-gray-400'}"></span>
          {#if hasRank}
            <span class="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-lg bg-terra-accent text-white text-xs font-bold flex items-center justify-center shadow-sm font-display">
              #{player.confidenceRank}
            </span>
          {/if}
          {#if player.id === room?.hostId}
            <span class="absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-white/60 text-gray-700 font-display text-[9px] font-bold backdrop-blur-sm">
              H
            </span>
          {/if}
        </div>
        <span class="text-[11px] font-semibold text-terra-muted">{player.name}</span>
      </button>
    {/each}
  </div>

  <!-- Main game area -->
  <main class="flex flex-col items-center gap-5 p-4 pb-20 min-h-[calc(100vh-180px)] bg-gradient-to-b from-terra-page via-terra-page to-terra-alt font-sans">
    {#if hasHand}
      <!-- Campaign progress strip (subtle) -->
      {#if room?.campaignStatus === 'ongoing'}
        <div class="w-full max-w-4xl">
          <div class="h-1.5 rounded-full bg-terra-surface-2 overflow-hidden mb-2">
            <div
              class="h-full bg-gradient-to-r from-terra-success to-emerald-400 transition-all duration-500 ease-out"
              style="width: {(room?.targetSuccesses ?? 0) > 0
                ? ((room?.successfulHands ?? 0) / (room?.targetSuccesses ?? 1)) * 100
                : 0}%"
            ></div>
          </div>
          <div class="flex justify-between items-center text-xs">
            <span class="text-green-500 font-semibold">{room?.successfulHands ?? 0}/{room?.targetSuccesses ?? 0} ✓</span>
            <span class="text-red-500 font-semibold">{room?.failedHands ?? 0}/{room?.maxFailures ?? 0} ✗</span>
          </div>
        </div>
      {/if}

      <!-- Community cards -->
      <section class="flex flex-col items-center gap-2" aria-label="Community cards">
        <div class="flex items-center gap-3 flex-wrap justify-center">
          {#each boardSlots as card, i (i)}
            {#if card}
              <div class="relative w-20 h-28 rounded-2xl bg-white shadow-lg shadow-black/10 border border-terra-edge/50 flex flex-col items-center justify-center transition-transform hover:scale-105" role="listitem" aria-label="{cardRank(card)} of {cardSuitSymbol(card)}">
                <span class="font-display text-xl font-bold" style="color: {suitColor(card)}">{cardRank(card)}</span>
                <span class="text-2xl" style="color: {suitColor(card)}">{cardSuitSymbol(card)}</span>
              </div>
            {:else}
              <div class="relative w-20 h-28 rounded-2xl bg-terra-surface shadow-inner shadow-black/5 border border-terra-edge/50 flex items-center justify-center" role="listitem" aria-label="Hidden community card">
                <span class="text-terra-faint text-2xl">◆</span>
              </div>
            {/if}
          {/each}
        </div>
        <span class="text-[11px] font-semibold tracking-wide uppercase text-terra-muted">Community Cards</span>
      </section>

      <!-- Hole cards -->
      <section class="flex flex-col items-center gap-2" aria-label="Your hidden hand">
        {#if session.holeCards.length > 0}
          <div class="flex items-center gap-3">
            {#each session.holeCards as card, i (`${card}-${i}`)}
              <div class="relative w-20 h-28 rounded-2xl bg-white shadow-lg shadow-black/10 border border-terra-edge/50 flex flex-col items-center justify-center transition-transform hover:scale-105" role="listitem" aria-label="{cardRank(card)} of {cardSuitSymbol(card)}">
                <span class="font-display text-xl font-bold" style="color: {suitColor(card)}">{cardRank(card)}</span>
                <span class="text-2xl" style="color: {suitColor(card)}">{cardSuitSymbol(card)}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="flex flex-col items-center gap-2 p-4 rounded-2xl bg-terra-surface-2 border border-terra-edge/30">
            <p class="text-sm text-terra-muted">Your private cards haven't synced yet.</p>
            <button type="button" class="px-4 py-2 rounded-xl bg-terra-surface hover:bg-terra-surface-3 text-terra-ink text-sm font-semibold transition-colors border border-terra-edge cursor-pointer" onclick={() => session.requestPrivateState()}>
              Sync my cards
            </button>
          </div>
        {/if}
        <span class="text-[11px] font-semibold tracking-wide uppercase text-terra-muted">Your Hand</span>
      </section>

      <!-- Confidence rack -->
      <section class="w-full max-w-2xl mt-2" aria-label="Confidence ranking">
        <div class="flex flex-col gap-3 p-4 rounded-3xl bg-terra-surface/80 border border-terra-edge/50 shadow-xl shadow-black/5">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <span class="text-[11px] font-semibold tracking-wide uppercase text-terra-muted">Confidence Ranking</span>
            {#if me?.confidenceRank}
              <span class="text-xs text-terra-muted">You claimed <strong class="font-display font-bold text-terra-accent">#{me.confidenceRank}</strong></span>
            {:else if isPlaying}
              <span class="text-xs text-terra-muted">Claim the slot that matches your read</span>
            {/if}
          </div>

          <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {#each confidenceSlots as rank (rank)}
              {@const owner = slotOwner(rank)}
              {@const isMine = owner?.id === session.mySessionId}
              {@const isClaimed = owner !== null}
              <button
                type="button"
                class="relative flex flex-col items-center gap-0.5 p-3 rounded-xl border transition-all duration-200 font-sans
                  {room?.phase === 'playing' || room?.phase === 'finished'
                    ? isMine
                      ? 'bg-terra-accent text-white border-terra-accent shadow-lg shadow-orange-300/25'
                      : isClaimed
                        ? 'bg-terra-surface-2 text-terra-muted border-terra-edge/50 opacity-70'
                        : 'bg-terra-surface text-terra-ink border-terra-edge hover:border-terra-accent hover:bg-terra-surface-2 hover:shadow-md cursor-pointer'
                    : 'bg-terra-surface-2 text-terra-muted border-terra-edge/30 opacity-45 cursor-not-allowed'}"
                onclick={() => session.claimConfidenceRank(rank)}
                disabled={room?.phase !== 'playing'}
              >
                <span class="font-display text-sm font-bold">#{rank}</span>
                <span class="text-[11px] leading-tight">{isMine ? 'You' : isClaimed ? owner.name : 'Open'}</span>
                {#if isMine}
                  <span class="w-1.5 h-1.5 mt-0.5 rounded-full bg-white/70"></span>
                {/if}
              </button>
            {/each}
          </div>

          {#if room?.phase === 'playing'}
            {#if me?.confidenceRank}
              <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-terra-surface-2 border border-terra-edge/40">
                <span class="w-1.5 h-1.5 rounded-full bg-terra-accent animate-pulse"></span>
                <span class="text-xs text-terra-muted">
                  {#if room?.street === 'pre-flop'}
                    Waiting for the flop…
                  {:else}
                    Rank claimed. Adjust or confirm when ready.
                  {/if}
                </span>
              </div>
            {:else}
              <div class="px-3 py-2 rounded-xl bg-terra-surface-2 border border-terra-edge/40">
                <span class="text-xs text-terra-muted">
                  {#if room?.street === 'pre-flop'}
                    Study your cards — ranking opens after the flop.
                  {:else}
                    Claim a slot to rank your confidence.
                  {/if}
                </span>
              </div>
            {/if}

            {#if me?.confidenceRank}
              <div>
                <button type="button" class="px-3 py-1.5 rounded-lg bg-transparent hover:bg-terra-surface-2 text-terra-faint hover:text-terra-muted text-xs font-semibold transition-colors border-none cursor-pointer" onclick={() => session.clearConfidenceRank()}>
                  Clear my rank
                </button>
              </div>
            {/if}
          {/if}

          {#if room?.phase === 'finished'}
            <div class="px-3 py-2 rounded-xl bg-terra-surface-2 border border-terra-edge/40">
              <span class="text-xs text-terra-muted">
                {#if room?.campaignStatus === 'ongoing'}
                  Hand complete — waiting for next deal.
                {:else if room?.campaignStatus === 'won'}
                  The crew completed the run! 🎉
                {:else}
                  The crew hit max alarms.
                {/if}
              </span>
            </div>
          {/if}
        </div>
      </section>

      <!-- Status banner area -->
      {#if session.banner}
        <p class="px-4 py-2 rounded-xl bg-terra-surface-2 border border-terra-edge/40 text-sm text-terra-muted" aria-live="polite">{session.banner}</p>
      {/if}
      {#if session.errorMessage}
        <p class="px-4 py-2 rounded-xl bg-red-50/80 border border-red-200/60 text-sm text-red-700" aria-live="assertive">{session.errorMessage}</p>
      {/if}
    {:else}
      <!-- No hand view yet (shouldn't normally happen on game route) -->
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-terra-muted">Waiting for the hand to begin…</p>
        {#if session.banner}
          <p class="text-terra-faint text-sm mt-2" aria-live="polite">{session.banner}</p>
        {/if}
      </div>
    {/if}
  </main>
{/if}

<!-- ─── SETTINGS DRAWER ─── -->
{#if showSettings}
  <button type="button" aria-label="Close settings" class="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm border-none cursor-pointer" onclick={() => (showSettings = false)}></button>
  <div class="fixed top-0 right-0 z-[60] h-full w-full max-w-sm bg-terra-surface shadow-2xl font-sans text-terra-ink sm:rounded-l-3xl border-l border-terra-edge/40">
    <div class="flex items-center justify-between px-5 py-4 border-b border-terra-edge/60">
      <h2 class="text-lg font-bold">Settings</h2>
      <button
        type="button"
        aria-label="Close settings"
        class="w-8 h-8 flex items-center justify-center rounded-lg bg-terra-surface-2 hover:bg-terra-surface-3 text-terra-muted hover:text-terra-ink transition-colors border-none cursor-pointer p-0"
        onclick={() => (showSettings = false)}
      >
        ✕
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-5">
      <!-- Room info -->
      <div class="flex flex-col gap-4 mb-6">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-terra-muted uppercase tracking-wide">Room code</span>
          <div class="flex items-center gap-2">
            <code class="flex-1 px-3 py-1.5 rounded-lg bg-terra-surface-2 text-sm font-mono text-terra-ink">{session.roomId ?? '—'}</code>
            <button type="button" class="px-3 py-1.5 rounded-lg bg-terra-surface-2 hover:bg-terra-surface-3 text-sm font-semibold text-terra-ink transition-colors border-none cursor-pointer" onclick={copyRoomCode}>Copy</button>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-terra-muted uppercase tracking-wide">Connection</span>
          <span class="text-sm text-terra-ink">{session.connectionState === 'connected' ? '🟢 Connected' : session.connectionState === 'connecting' ? '🟡 Connecting…' : '🔴 Disconnected'}</span>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-terra-muted uppercase tracking-wide">You are</span>
          <span class="text-sm text-terra-ink">{me?.name ?? '—'}</span>
        </div>

        {#if me?.confidenceRank}
          <div class="flex flex-col gap-1">
            <span class="text-xs font-semibold text-terra-muted uppercase tracking-wide">Your claim</span>
            <span class="text-sm font-display font-bold text-terra-accent">#{me.confidenceRank}</span>
          </div>
        {/if}
      </div>

      <!-- Host controls (behind friction) -->
      {#if session.isHost}
        <div class="flex flex-col gap-3 pt-4 border-t border-terra-edge/60">
          <span class="text-xs font-semibold text-terra-muted uppercase tracking-wide">Host controls</span>
          <div class="flex flex-col gap-2">
            {#if session.canResolveShowdown}
              <button type="button" class="w-full px-4 py-2.5 rounded-xl bg-terra-surface hover:bg-terra-surface-3 text-terra-ink text-sm font-semibold transition-colors border border-terra-edge cursor-pointer" onclick={() => session.resolveShowdown()}>
                Resolve showdown
              </button>
            {:else if session.canAdvanceStreet}
              <button type="button" class="w-full px-4 py-2.5 rounded-xl bg-terra-surface hover:bg-terra-surface-3 text-terra-ink text-sm font-semibold transition-colors border border-terra-edge cursor-pointer" onclick={() => session.advanceStreet()}>
                {session.advanceStreetLabel}
              </button>
            {/if}

            {#if room?.phase === 'finished'}
              {#if room.campaignStatus === 'ongoing' && session.canDealNextHand}
                <button type="button" class="w-full px-4 py-2.5 rounded-xl bg-terra-surface hover:bg-terra-surface-3 text-terra-ink text-sm font-semibold transition-colors border border-terra-edge cursor-pointer" onclick={() => session.dealNextHand()}>
                  Deal next hand
                </button>
              {:else if session.canRestartRun}
                <button type="button" class="w-full px-4 py-2.5 rounded-xl bg-terra-surface hover:bg-terra-surface-3 text-terra-ink text-sm font-semibold transition-colors border border-terra-edge cursor-pointer" onclick={() => session.restartRun()}>
                  Restart run
                </button>
              {/if}
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <div class="p-5 border-t border-terra-edge/60">
      <button type="button" class="w-full px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 text-sm font-semibold transition-colors border border-red-500/20 cursor-pointer" onclick={() => void session.disconnect()}>
        Leave room
      </button>
    </div>
  </div>
{/if}

<!-- ─── PLAYER DRAWER ─── -->
{#if showPlayerDrawer}
  <button type="button" aria-label="Close player roster" class="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm border-none cursor-pointer" onclick={() => (showPlayerDrawer = false)}></button>
  <div class="fixed top-0 left-0 z-[60] h-full w-full max-w-sm bg-terra-surface shadow-2xl font-sans text-terra-ink sm:rounded-r-3xl border-r border-terra-edge/40">
    <div class="flex items-center justify-between px-5 py-4 border-b border-terra-edge/60">
      <h2 class="text-lg font-bold">Players</h2>
      <button
        type="button"
        aria-label="Close player roster"
        class="w-8 h-8 flex items-center justify-center rounded-lg bg-terra-surface-2 hover:bg-terra-surface-3 text-terra-muted hover:text-terra-ink transition-colors border-none cursor-pointer p-0"
        onclick={() => (showPlayerDrawer = false)}
      >
        ✕
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      {#if room}
        <div class="flex flex-col gap-2">
          {#each room.players as player (player.id)}
            {@const isSelf = player.id === session.mySessionId}
            <div class="flex items-center gap-3 p-3 rounded-xl bg-terra-surface-2 border border-terra-edge/40 {player.connected ? '' : 'opacity-40'}">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-terra-surface-3 font-display text-sm font-bold text-terra-ink">
                {player.name.slice(0, 2).toUpperCase()}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 mb-0.5">
                  <span class="text-sm font-semibold text-terra-ink truncate">{player.name}</span>
                  {#if isSelf}
                    <span class="shrink-0 px-1.5 py-0.5 rounded-md bg-terra-accent/20 text-terra-accent text-[10px] font-bold uppercase tracking-wide">you</span>
                  {/if}
                  {#if player.id === room.hostId}
                    <span class="shrink-0 px-1.5 py-0.5 rounded-md bg-white/60 text-gray-600 text-[10px] font-bold uppercase tracking-wide">host</span>
                  {/if}
                </div>
                <div class="flex items-center gap-1 text-xs text-terra-muted font-display">
                  {#if hasHand}
                    <span>{player.confidenceRank ? `Rank #${player.confidenceRank}` : 'No rank'}</span>
                    <span>·</span>
                  {:else}
                    <span>{player.ready ? '✓ Ready' : 'Waiting'}</span>
                    <span>·</span>
                  {/if}
                  <span>{player.connected ? 'Online' : 'Away'}</span>
                </div>
              </div>
              <div class="w-2 h-2 rounded-full {player.connected ? 'bg-green-500' : 'bg-gray-400'}"></div>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-center text-terra-muted text-sm">No room data yet.</p>
      {/if}
    </div>
  </div>
{/if}

<!-- ─── RECONNECTION OVERLAY ─── -->
{#if session.connectionState === 'connecting' || session.connectionState === 'error'}
  <div class="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-terra-page/97 font-sans">
    <div class="max-w-xs w-full p-8 rounded-3xl bg-terra-surface shadow-2xl border border-terra-edge text-center">
      <div class="text-4xl text-center mb-2">📡</div>
      <h2 class="text-xl font-bold text-center mb-2">Reconnecting…</h2>
      <p class="text-sm text-center text-terra-muted leading-relaxed mb-0">
        {#if session.connectionState === 'connecting'}
          Establishing connection to the room.
        {:else}
          Connection lost. Attempting to reconnect…
        {/if}
      </p>
      <div class="flex justify-center mt-4">
        <span class="w-2 h-2 rounded-full bg-terra-accent animate-pulse"></span>
      </div>
    </div>
  </div>
{/if}

<!-- ─── CONFIRMATION / LOCK-IN MODAL ─── -->
{#if showConfirmModal && phase === 'playing' && myRank !== null}
  <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-terra-overlay/50 backdrop-blur-sm font-sans">
    <div class="max-w-md w-full p-6 rounded-3xl bg-terra-surface shadow-xl border border-terra-edge text-terra-ink">
      <h2 class="text-xl font-bold text-center mb-3">Lock in your rank?</h2>
      <p class="text-sm text-center text-terra-muted leading-relaxed mb-5">
        Everyone has ranked. You claimed
        <strong class="font-display font-bold text-terra-accent">#{myRank}</strong>.
      </p>
      <div class="flex gap-3">
        <button
          type="button"
          class="flex-1 px-4 py-3 rounded-xl bg-terra-accent hover:bg-orange-500 text-white text-sm font-bold transition-colors border-none cursor-pointer shadow-lg shadow-orange-300/30"
          onclick={() => (showConfirmModal = false)}
        >
          Lock In ✓
        </button>
        <button
          type="button"
          class="w-auto px-4 py-3 rounded-xl bg-terra-surface hover:bg-terra-surface-2 text-terra-ink text-sm font-semibold transition-colors border border-terra-edge cursor-pointer"
          onclick={() => {
            showConfirmModal = false;
            session.clearConfidenceRank();
          }}
        >
          Change
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ─── SWAP REQUEST MODAL ─── -->
{#if showSwapModal && !swapDismissed}
  {@const swapRequester = connectedPlayers.find((p) => p.id !== session.mySessionId && p.confidenceRank !== null)}
  {#if swapRequester && myRank !== null}
    <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-terra-overlay/50 backdrop-blur-sm font-sans">
      <div class="max-w-md w-full p-6 rounded-3xl bg-terra-surface shadow-xl border border-terra-edge text-terra-ink">
        <div class="text-4xl text-center mb-2">🤝</div>
        <h2 class="text-xl font-bold text-center mb-3">Swap requested</h2>
        <p class="text-sm text-center text-terra-muted leading-relaxed mb-5">
          <strong>{swapRequester.name}</strong> wants rank
          <strong class="font-display font-bold text-terra-accent">#{swapRequester.confidenceRank}</strong>.
          You currently hold rank <strong class="font-display font-bold text-terra-accent">#{myRank}</strong>.
        </p>
        <div class="flex gap-3">
          <button type="button" class="flex-1 px-4 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold transition-colors border-none cursor-pointer shadow-lg shadow-green-300/30" onclick={() => (showSwapModal = false)}>
            Accept swap
          </button>
          <button type="button" class="w-auto px-4 py-3 rounded-xl bg-terra-surface hover:bg-terra-surface-2 text-terra-ink text-sm font-semibold transition-colors border border-terra-edge cursor-pointer" onclick={() => (showSwapModal = false)}>
            Reject
          </button>
        </div>
        <button type="button" class="w-full mt-2 py-2 bg-transparent hover:bg-transparent text-terra-faint hover:text-terra-muted text-xs font-semibold transition-colors border-none cursor-pointer text-center" onclick={() => (swapDismissed = true)}>
          Dismiss to view the board
        </button>
      </div>
    </div>
  {/if}
{/if}

<!-- Swap request dismissed? Show persistent badge -->
{#if swapDismissed && showSwapModal}
  <button type="button" class="fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-2xl bg-terra-surface shadow-lg border border-terra-edge hover:bg-terra-surface-2 transition-colors cursor-pointer border-none p-0 font-sans text-sm font-semibold text-terra-ink" onclick={() => (swapDismissed = false)}>
    🤝 <span>Swap pending</span> <span class="w-1.5 h-1.5 rounded-full bg-terra-accent animate-pulse"></span>
  </button>
{/if}

<!-- ─── RESULT MODAL (SUCCESS) ─── -->
{#if phase === 'finished' && outcome === 'success'}
  {@const resultRows = room?.players.filter((p) => p.confidenceRank !== null) ?? []}
  <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-terra-overlay/60 backdrop-blur-md font-sans">
    <div class="max-w-sm w-full p-6 rounded-3xl bg-terra-surface shadow-2xl border border-terra-edge text-terra-ink">
      <div class="text-5xl text-center mb-3">🎉</div>
      <h2 class="text-2xl font-extrabold text-center mb-1">The order matched!</h2>
      <p class="text-xs text-center text-terra-faint mb-4">Round {room?.round ?? '—'} complete</p>

      <div class="flex flex-col gap-2 mb-4">
        {#each resultRows as player (player.id)}
          <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-terra-surface-2 border border-terra-edge/50">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-terra-surface-3 text-sm font-bold font-display text-terra-ink">
              #{player.confidenceRank}
            </div>
            <span class="flex-1 text-sm font-semibold text-terra-ink">{player.id === session.mySessionId ? 'You' : player.name}</span>
            <span class="text-xs text-terra-muted font-display">{player.handLabel ?? '—'}</span>
            <span class="text-base font-bold text-green-500">{player.actualRank === player.confidenceRank ? '✓' : '✗'}</span>
          </div>
        {/each}
      </div>

      <div class="flex items-center justify-center gap-2 pt-2 border-t border-terra-edge/40">
        <span class="text-sm font-bold text-green-500">{room?.successfulHands ?? 0}/{room?.targetSuccesses ?? 0} ✓</span>
        <span class="text-terra-faint">·</span>
        <span class="text-sm font-bold text-red-500">{room?.failedHands ?? 0}/{room?.maxFailures ?? 0} ✗</span>
      </div>
    </div>
  </div>
{/if}

<!-- ─── RESULT MODAL (FAILURE) ─── -->
{#if phase === 'finished' && outcome === 'failure'}
  {@const resultRows = room?.players.filter((p) => p.confidenceRank !== null) ?? []}
  <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-terra-overlay/60 backdrop-blur-md font-sans">
    <div class="max-w-sm w-full p-6 rounded-3xl bg-terra-surface shadow-2xl border border-terra-edge text-terra-ink">
      <div class="text-5xl text-center mb-3">💀</div>
      <h2 class="text-2xl font-extrabold text-center mb-1 text-red-500">The order missed.</h2>
      <p class="text-xs text-center text-terra-faint mb-4">Round {room?.round ?? '—'} · Alarms: {room?.failedHands ?? 0}/{room?.maxFailures ?? 0}</p>

      <div class="flex flex-col gap-2 mb-4">
        {#each resultRows as player (player.id)}
          <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-terra-surface-2 border border-terra-edge/50">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-terra-surface-3 text-sm font-bold font-display text-terra-ink">
              #{player.confidenceRank}
            </div>
            <span class="flex-1 text-sm font-semibold text-terra-ink">{player.id === session.mySessionId ? 'You' : player.name}</span>
            <span class="text-xs text-terra-muted font-display">{player.handLabel ?? '—'}</span>
            <span class="text-base font-bold text-green-500">{player.actualRank === player.confidenceRank ? '✓' : '✗'}</span>
          </div>
        {/each}
      </div>

      <div class="flex items-center justify-center gap-2 pt-2 border-t border-terra-edge/40">
        <span class="text-sm font-bold text-green-500">{room?.successfulHands ?? 0}/{room?.targetSuccesses ?? 0} ✓</span>
        <span class="text-terra-faint">·</span>
        <span class="text-sm font-bold text-red-500">{room?.failedHands ?? 0}/{room?.maxFailures ?? 0} ✗</span>
      </div>
    </div>
  </div>
{/if}

<!-- ─── READY-CHECK MODAL (between hands) ─── -->
{#if phase === 'finished' && campaignStatus === 'ongoing'}
  <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-terra-overlay/50 backdrop-blur-sm font-sans">
    <div class="max-w-md w-full p-6 rounded-3xl bg-terra-surface shadow-xl border border-terra-edge text-terra-ink">
      <h2 class="text-xl font-bold text-center mb-3">Hand complete</h2>
      <p class="text-sm text-center text-terra-muted leading-relaxed mb-5">Ready for round {(room?.round ?? 0) + 1}?</p>

      <div class="flex flex-wrap justify-center gap-4 mb-5">
        {#each connectedPlayers as player (player.id)}
          <div class="flex flex-col items-center gap-1">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center bg-terra-surface-2 text-sm font-bold font-display text-terra-ink {player.id === session.mySessionId ? 'ring-2 ring-terra-accent ring-offset-2 ring-offset-terra-surface' : ''}">
              {player.name.slice(0, 2).toUpperCase()}
            </div>
            <span class="text-[11px] font-semibold">{player.id === session.mySessionId ? 'You' : player.name}</span>
            <span class="text-[10px] font-bold uppercase tracking-wide {player.ready ? 'text-green-500' : 'text-terra-faint'}">
              {player.ready ? '✓ Ready' : 'Waiting'}
            </span>
          </div>
        {/each}
      </div>

      <button type="button" class="w-full px-4 py-3 rounded-xl bg-terra-accent hover:bg-orange-500 text-white text-sm font-bold transition-colors border-none cursor-pointer shadow-lg shadow-orange-300/30" onclick={() => session.toggleReady()}>
        Ready for next hand
      </button>
    </div>
  </div>
{/if}

<!-- ─── CAMPAIGN WON ─── -->
{#if phase === 'finished' && campaignStatus === 'won'}
  <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-terra-overlay/60 backdrop-blur-md font-sans">
    <div class="max-w-xs w-full p-8 rounded-3xl bg-terra-surface shadow-2xl border border-terra-edge text-center">
      <div class="text-5xl text-center mb-3">🏆</div>
      <h2 class="text-2xl font-extrabold text-center mb-1 text-green-500">The crew completed the run!</h2>
      <p class="text-sm text-center text-terra-muted font-display mb-5">
        {room?.successfulHands ?? 0} ✓ · {room?.failedHands ?? 0} ✗ · {room?.round ?? 0} rounds
      </p>
      <button type="button" class="w-full px-4 py-3 rounded-xl bg-terra-accent hover:bg-orange-500 text-white text-sm font-bold transition-colors border-none cursor-pointer shadow-lg shadow-orange-300/30" onclick={() => session.restartRun()}>
        Play Again
      </button>
    </div>
  </div>
{/if}

<!-- ─── CAMPAIGN LOST ─── -->
{#if phase === 'finished' && campaignStatus === 'lost'}
  <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-terra-overlay/60 backdrop-blur-md font-sans">
    <div class="max-w-xs w-full p-8 rounded-3xl bg-terra-surface shadow-2xl border border-terra-edge text-center">
      <div class="text-5xl text-center mb-3">💀</div>
      <h2 class="text-2xl font-extrabold text-center mb-1 text-red-500">The crew hit max alarms.</h2>
      <p class="text-sm text-center text-terra-muted font-display mb-5">
        {room?.successfulHands ?? 0} ✓ · {room?.failedHands ?? 0} ✗ · {room?.round ?? 0} rounds
      </p>
      <button type="button" class="w-full px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-bold transition-colors border border-red-500/30 cursor-pointer" onclick={() => session.restartRun()}>
        Try Again
      </button>
    </div>
  </div>
{/if}

<!-- ─── TOAST AREA ─── -->
{#if session.banner && session.banner !== 'Room code copied' && session.banner !== 'Copy failed'}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-2">
    <div class="px-5 py-2.5 rounded-full bg-terra-ink text-terra-surface text-sm font-semibold shadow-xl font-sans">
      {session.banner}
    </div>
  </div>
{/if}

<style>
  /* The terra-* colors and fonts are defined in app.css via Tailwind @theme.
     This block contains only non-Tailwind overrides. */

  /* Override room-dashboard global styles for the game page */
  :global(body) {
    background: var(--color-terra-page);
  }

</style>