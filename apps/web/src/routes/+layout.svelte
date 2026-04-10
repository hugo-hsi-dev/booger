<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';

  import '$lib/room-dashboard.css';
  import { getServerEndpoint } from '$lib/game-client';
  import { setRoomSession } from '$lib/room-session-context';
  import { RoomSession } from '$lib/room-session.svelte';

  let { children } = $props();

  const session = new RoomSession(getServerEndpoint());
  setRoomSession(session);

  onMount(() => {
    session.init();
  });

  function syncRoute(path: string, target: string) {
    if (path === target) {
      return;
    }

    void goto(target, {
      replaceState: true,
      noScroll: true,
      keepFocus: true
    });
  }

  $effect(() => {
    const room = session.roomView;
    const path = page.url.pathname;
    const roomId = session.roomId;

    if (!room || !roomId) {
      return;
    }

    const roomRoot = `/room/${roomId}`;
    const gamePath = `${roomRoot}/game`;

    if (path === '/') {
      syncRoute(path, room.phase === 'playing' ? gamePath : roomRoot);
      return;
    }

    if (path === roomRoot && room.phase === 'playing') {
      syncRoute(path, gamePath);
      return;
    }

    if (path === gamePath && room.phase === 'lobby') {
      syncRoute(path, roomRoot);
    }
  });
</script>

<svelte:window onbeforeunload={() => session.shutdown()} onpagehide={() => session.shutdown()} />

{@render children()}
