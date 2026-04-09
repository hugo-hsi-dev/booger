# Project Notes

- Build the game as a web app using **SvelteKit + TypeScript** on the frontend.
- Use **Colyseus + Node.js + TypeScript** for the realtime game server.
- Keep the MVP **in-memory only**: no Redis, no database, no Drizzle.
- Treat the server as authoritative; never trust the client for game rules or hidden info.
- Keep game rules in a shared, pure TypeScript package separate from UI and room code.
- Suggested layout: `apps/web`, `apps/server`, `packages/game`.
- Add persistence only later if we need accounts, stats, history, or multi-server scaling.
