import { createContext } from 'svelte';

import type { RoomSession } from './room-session.svelte';

export const [getRoomSession, setRoomSession] = createContext<RoomSession>();
