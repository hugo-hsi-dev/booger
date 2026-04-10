import { Server } from 'colyseus';

import { GameRoom } from './rooms/GameRoom.js';

const port = Number(process.env.PORT ?? 2567);

const gameServer = new Server({
  express: (app) => {
    app.get('/healthz', (_req: unknown, res: { status(code: number): { send(body: string): void } }) => {
      res.status(200).send('ok');
    });
  }
});

gameServer.define('game', GameRoom);

await gameServer.listen(port);
console.log(`Colyseus server running on http://localhost:${port}`);
