<script lang="ts">
  import type { CampaignStatus, PlayerView, RoomView, TableStreet } from '$lib/game-client';

  type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

  type ControlsProps = {
    playerName: string;
    roomCode: string;
    connectionState: ConnectionState;
    connectionLabel: string;
    roomView: RoomView | null;
    me: PlayerView | null;
    canStart: boolean;
    canAdvanceStreet: boolean;
    canResolveShowdown: boolean;
    canDealNextHand: boolean;
    canRestartRun: boolean;
    advanceStreetLabel: string;
    banner: string;
    errorMessage: string;
    formatStreetLabel: (street: TableStreet) => string;
    formatCampaignStatusLabel: (status: CampaignStatus) => string;
    formatTime: (value: number) => string;
    connect: (mode: 'create' | 'join') => void;
    disconnect: () => void;
    toggleReady: () => void;
    startGame: () => void;
    requestPrivateState: () => void;
    resolveShowdown: () => void;
    advanceStreet: () => void;
    dealNextHand: () => void;
    restartRun: () => void;
  };

  let {
    playerName = $bindable(),
    roomCode = $bindable(),
    connectionState,
    connectionLabel,
    roomView,
    me,
    canStart,
    canAdvanceStreet,
    canResolveShowdown,
    canDealNextHand,
    canRestartRun,
    advanceStreetLabel,
    banner,
    errorMessage,
    formatStreetLabel,
    formatCampaignStatusLabel,
    formatTime,
    connect,
    disconnect,
    toggleReady,
    startGame,
    requestPrivateState,
    resolveShowdown,
    advanceStreet,
    dealNextHand,
    restartRun
  }: ControlsProps = $props();
</script>

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

    {#if roomView?.phase === 'lobby'}
      <button type="button" class="ghost" onclick={() => void toggleReady()} disabled={!roomView || !me}>
        {me?.ready ? 'Mark unready' : 'Mark ready'}
      </button>
      <button type="button" class="ghost" onclick={startGame} disabled={!canStart}>
        Start game
      </button>
    {:else if roomView?.phase === 'playing'}
      <button type="button" class="ghost" onclick={() => requestPrivateState()} disabled={!roomView}>
        Sync my cards
      </button>

      {#if canResolveShowdown}
        <button type="button" class="ghost" onclick={resolveShowdown}>
          Resolve showdown
        </button>
      {:else}
        <button type="button" class="ghost" onclick={advanceStreet} disabled={!canAdvanceStreet}>
          {advanceStreetLabel}
        </button>
      {/if}
    {:else if roomView?.phase === 'finished'}
      <button type="button" class="ghost" onclick={() => requestPrivateState()} disabled={!roomView}>
        Sync my cards
      </button>
      {#if roomView.campaignStatus === 'ongoing'}
        <button type="button" class="ghost" onclick={dealNextHand} disabled={!canDealNextHand}>
          Deal next hand
        </button>
      {:else}
        <button type="button" class="ghost" onclick={restartRun} disabled={!canRestartRun}>
          Restart run
        </button>
      {/if}
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
        <span class="meta-label">Your read</span>
        <strong>{me?.confidenceRank ? `#${me.confidenceRank}` : 'Unset'}</strong>
      </div>
    </div>
  {:else if roomView?.phase === 'finished'}
    <div class={`play-brief outcome-${roomView.outcome}`}>
      <div>
        <span class="meta-label">Round</span>
        <strong>{roomView.round}</strong>
      </div>
      <div>
        <span class="meta-label">Run state</span>
        <strong>{formatCampaignStatusLabel(roomView.campaignStatus)}</strong>
      </div>
      <div>
        <span class="meta-label">Finished</span>
        <strong>{formatTime(roomView.finishedAt)}</strong>
      </div>
    </div>
  {/if}

  <p class="banner" aria-live="polite">{banner}</p>
  {#if errorMessage}
    <p class="error" aria-live="assertive">{errorMessage}</p>
  {/if}
</article>
