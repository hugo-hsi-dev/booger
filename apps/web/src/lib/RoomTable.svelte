<script lang="ts">
  import type { CardCode, PlayerView, RoomView, CampaignStatus, TableStreet } from '$lib/game-client';

  type TableProps = {
    roomView: RoomView | null;
    me: PlayerView | null;
    mySessionId: string;
    totalPlayers: number;
    connectedPlayers: number;
    readyPlayers: number;
    hasHandView: boolean;
    holeCards: CardCode[];
    boardSlots: Array<CardCode | null>;
    confidenceSlots: number[];
    tableSubline: string;
    formatStreetLabel: (street: TableStreet) => string;
    formatCampaignStatusLabel: (status: CampaignStatus) => string;
    formatTime: (value: number) => string;
    playerStatus: (player: PlayerView) => string;
    confidenceSlotOwner: (rank: number) => PlayerView | null;
    cardRank: (card: CardCode) => string;
    cardSuitSymbol: (card: CardCode) => string;
    cardTone: (card: CardCode | null) => string;
    confidenceSlotTone: (rank: number, owner: PlayerView | null) => string;
    copyRoomCode: () => void;
    requestPrivateState: () => void;
    claimConfidenceRank: (rank: number) => void;
    clearConfidenceRank: () => void;
  };

  let {
    roomView,
    me,
    mySessionId,
    totalPlayers,
    connectedPlayers,
    readyPlayers,
    hasHandView,
    holeCards,
    boardSlots,
    confidenceSlots,
    tableSubline,
    formatStreetLabel,
    formatCampaignStatusLabel,
    formatTime,
    playerStatus,
    confidenceSlotOwner,
    cardRank,
    cardSuitSymbol,
    cardTone,
    confidenceSlotTone,
    copyRoomCode,
    requestPrivateState,
    claimConfidenceRank,
    clearConfidenceRank
  }: TableProps = $props();
</script>

<article class="panel table">
  <header>
    <div>
      <span class="eyebrow">Live table</span>
      <h2>{hasHandView ? 'Confidence table' : 'Room snapshot'}</h2>
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

      {#if hasHandView}
        <div>
          <span class="meta-label">Progress</span>
          <strong>{roomView.successfulHands}/{roomView.targetSuccesses}</strong>
        </div>
        <div>
          <span class="meta-label">Alarms</span>
          <strong>{roomView.failedHands}/{roomView.maxFailures}</strong>
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

    {#if hasHandView}
      <section class="campaign-track panel-surface">
        <div class="surface-header">
          <div>
            <span class="eyebrow">Crew progress</span>
            <h3>{formatCampaignStatusLabel(roomView.campaignStatus)}</h3>
          </div>
          <div class="street-meta">
            <span>{roomView.successfulHands}/{roomView.targetSuccesses} successful hands</span>
            <span>{roomView.failedHands}/{roomView.maxFailures} alarms</span>
          </div>
        </div>

        <div class="campaign-grid">
          <div class="campaign-lane">
            <span class="meta-label">Success track</span>
            <div class="token-row">
              {#each Array.from({ length: roomView.targetSuccesses }, (_, index) => index) as index (index)}
                <span class={`track-token success ${index < roomView.successfulHands ? 'filled' : ''}`}>{index + 1}</span>
              {/each}
            </div>
          </div>

          <div class="campaign-lane">
            <span class="meta-label">Alarm track</span>
            <div class="token-row">
              {#each Array.from({ length: roomView.maxFailures }, (_, index) => index) as index (index)}
                <span class={`track-token failure ${index < roomView.failedHands ? 'filled' : ''}`}>{index + 1}</span>
              {/each}
            </div>
          </div>
        </div>
      </section>
    {/if}

    {#if roomView.phase === 'finished'}
      <section class={`resolution panel-surface ${roomView.outcome}`}>
        <div>
          <span class="eyebrow">Round result</span>
          <h3>{roomView.outcome === 'success' ? 'The order matched' : 'The order missed'}</h3>
        </div>
        <p>
          {#if roomView.campaignStatus === 'ongoing'}
            {roomView.outcome === 'success'
              ? 'Confidence and actual strength aligned. The host can now deal the next hand.'
              : 'Use the revealed ranks to compare your read against reality, then deal the next hand.'}
          {:else if roomView.campaignStatus === 'won'}
            The crew completed the run. Restart the run to play another series.
          {:else}
            The run ended on the alarm track. Restart to begin fresh.
          {/if}
        </p>
      </section>
    {/if}

    {#if hasHandView}
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

      <section class="confidence-board panel-surface">
        <div class="surface-header">
          <div>
            <span class="eyebrow">Confidence order</span>
            <h3>Rank the table from strongest to weakest</h3>
          </div>
          <div class="street-meta">
            <span>#1 = strongest read</span>
            <span>#{totalPlayers} = weakest read</span>
          </div>
        </div>

        <div class="confidence-grid">
          {#each confidenceSlots as rank (rank)}
            {@const owner = confidenceSlotOwner(rank)}
            <button
              type="button"
              class={`confidence-slot ${confidenceSlotTone(rank, owner)}`}
              onclick={() => claimConfidenceRank(rank)}
              disabled={roomView.phase !== 'playing' || !me || Boolean(owner && owner.id !== mySessionId)}
            >
              <span class="slot-label">#{rank}</span>
              <strong>{owner?.name ?? 'Open slot'}</strong>
              <small>
                {#if roomView.phase === 'finished'}
                  {owner?.actualRank ? `Actual rank #${owner.actualRank}` : 'Unclaimed'}
                {:else if owner?.id === mySessionId}
                  Your current claim
                {:else if owner}
                  Claimed by {owner.name}
                {:else}
                  Tap to claim
                {/if}
              </small>
            </button>
          {/each}
        </div>

        {#if roomView.phase === 'playing'}
          <div class="confidence-actions">
            <p>
              {#if me?.confidenceRank}
                You currently claim slot <strong>#{me.confidenceRank}</strong>.
              {:else}
                Claim the slot that matches your hand strength estimate, with #1 as strongest.
              {/if}
            </p>
            <button type="button" class="ghost" onclick={clearConfidenceRank} disabled={!me?.confidenceRank}>
              Clear my slot
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
              {#if hasHandView}
                <span class="seat-tag">seat {player.seat + 1}</span>
                {#if roomView.dealerSeat === player.seat}
                  <span class="role-tag dealer">dealer</span>
                {/if}
                {#if roomView.activeSeat === player.seat}
                  <span class="role-tag action">action</span>
                {/if}
                {#if player.confidenceRank !== null}
                  <span class="role-tag confidence">read {player.confidenceRank}</span>
                {/if}
                {#if roomView.phase === 'finished' && player.actualRank !== null}
                  <span class="role-tag actual">actual {player.actualRank}</span>
                {/if}
              {/if}
            </div>
            <p>{playerStatus(player)}</p>
            {#if roomView.phase === 'finished' && player.handLabel}
              <p class="hand-label">{player.handLabel}</p>
            {/if}
          </div>
          <div class="status-stack">
            {#if hasHandView}
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
