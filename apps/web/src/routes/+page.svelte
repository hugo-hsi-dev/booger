<script lang="ts">
  import { goto } from '$app/navigation';

  import { getRoomSession } from '$lib/room-session-context';

  const session = getRoomSession();

  async function createRoom() {
    const room = await session.connect('create');

    if (!room) {
      return;
    }

    await goto(`/room/${room.roomId}`);
  }

  async function joinRoom() {
    const room = await session.connect('join');

    if (!room) {
      return;
    }

    await goto(`/room/${room.roomId}`);
  }
</script>

<svelte:head>
  <title>The Gang</title>
  <meta
    name="description"
    content="Create or join a realtime room for The Gang, then move from lobby to game with automatic reconnects."
  />
</svelte:head>

<main class="shell home-shell">
  <div class="backdrop" aria-hidden="true"></div>

  <section class="hero panel">
    <div class="eyebrow">Realtime co-op card table</div>
    <div class="hero-grid">
      <div>
        <h1>The Gang</h1>
        <p class="lede">
          Create a room, share the code, then move into the lobby and game screens as the table fills up.
        </p>
      </div>

      <div class="hero-meta">
        <div>
          <span class="meta-label">Server</span>
          <strong>{session.endpoint || 'Auto-detected in browser'}</strong>
        </div>
        <div>
          <span class="meta-label">Reconnect</span>
          <strong>{session.connectionState === 'connected' ? 'Live' : 'Ready'}</strong>
        </div>
        <div>
          <span class="meta-label">Flow</span>
          <strong>Home → lobby → game</strong>
        </div>
      </div>
    </div>
  </section>

  <section class="content-grid home-grid">
    <article class="panel controls home-entry">
      <header>
        <div>
          <span class="eyebrow">Join a lobby</span>
          <h2>Enter a room code</h2>
        </div>
        <span class={`pill ${session.connectionState}`}>{session.connectionState}</span>
      </header>

      <label>
        Room code
        <input
          bind:value={session.roomCode}
          placeholder="Paste a room code"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      <div class="button-row">
        <button type="button" class="primary" onclick={() => void createRoom()} disabled={session.connectionState === 'connecting'}>
          Create room
        </button>
        <button
          type="button"
          class="secondary"
          onclick={() => void joinRoom()}
          disabled={session.connectionState === 'connecting' || session.roomCode.trim().length === 0}
        >
          Join room
        </button>
      </div>

      <p class="banner" aria-live="polite">{session.banner}</p>
      {#if session.errorMessage}
        <p class="error" aria-live="assertive">{session.errorMessage}</p>
      {/if}

      <p class="home-note">
        Your display name can be set in the lobby before the game starts. If you refresh, the room will try to reconnect automatically.
      </p>
    </article>
  </section>
</main>
