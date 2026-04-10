import { z } from 'zod';

export const LobbyJoinOptionsSchema = z
  .object({
    name: z.string().trim().min(1).max(24).optional()
  })
  .strict();

export type LobbyJoinOptions = z.infer<typeof LobbyJoinOptionsSchema>;

export function normalizeLobbyJoinOptions(options: unknown): LobbyJoinOptions {
  const parsed = LobbyJoinOptionsSchema.safeParse(options);

  return parsed.success ? parsed.data : {};
}

export const LobbyActionMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('set-ready'),
      ready: z.boolean().optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('set-name'),
      name: z.string().trim().min(1).max(24)
    })
    .strict()
]);

export type LobbyActionMessage = z.infer<typeof LobbyActionMessageSchema>;

export const TableActionMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('advance-street') }).strict(),
  z.object({ type: z.literal('resolve-showdown') }).strict(),
  z.object({ type: z.literal('restart-run') }).strict(),
  z
    .object({
      type: z.literal('set-confidence'),
      confidenceRank: z.number().int().min(1).nullable().optional()
    })
    .strict(),
  z.object({ type: z.literal('next-hand') }).strict(),
  z.object({ type: z.literal('sync-private-state') }).strict()
]);

export type TableActionMessage = z.infer<typeof TableActionMessageSchema>;
