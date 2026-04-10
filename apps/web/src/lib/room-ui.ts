import type { CampaignStatus, CardCode, CardSuit, GameOutcome, PlayerView, TableStreet } from './game-client.js';

export const SUIT_SYMBOLS: Record<CardSuit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣'
};

export function createBoardSlots(communityCards: CardCode[]) {
  return Array.from({ length: 5 }, (_, index) => communityCards[index] ?? null);
}

export function createConfidenceSlots(totalPlayers: number) {
  return Array.from({ length: totalPlayers }, (_, index) => index + 1);
}

export function formatStreetLabel(street: TableStreet) {
  return street
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatOutcomeLabel(outcome: GameOutcome) {
  switch (outcome) {
    case 'success':
      return 'Matched';
    case 'failure':
      return 'Missed';
    default:
      return 'Pending';
  }
}

export function formatCampaignStatusLabel(status: CampaignStatus) {
  switch (status) {
    case 'won':
      return 'Run won';
    case 'lost':
      return 'Run lost';
    default:
      return 'Run active';
  }
}

export function formatTime(value: number) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

export function getAdvanceStreetLabel(street: TableStreet) {
  switch (street) {
    case 'pre-flop':
      return 'Reveal flop';
    case 'flop':
      return 'Reveal turn';
    case 'turn':
      return 'Reveal river';
    case 'river':
      return 'Go to showdown';
    default:
      return 'Street complete';
  }
}

export function playerStatus(player: PlayerView, phase: 'lobby' | 'playing' | 'finished' | undefined) {
  if (!player.connected) {
    return phase === 'lobby' ? 'Away' : 'Disconnected mid-hand';
  }

  if (phase === 'finished') {
    return player.handLabel ?? 'Showdown complete';
  }

  if (phase === 'playing') {
    if (player.confidenceRank !== null) {
      return `Claimed confidence slot #${player.confidenceRank}`;
    }

    return player.holeCardCount > 0 ? 'Still choosing confidence' : 'Waiting for the deal';
  }

  return player.ready ? 'Ready' : 'Waiting';
}

export function cardRank(card: CardCode) {
  const rank = card.slice(0, -1);
  return rank === 'T' ? '10' : rank;
}

export function cardSuit(card: CardCode) {
  return card.slice(-1) as CardSuit;
}

export function cardSuitSymbol(card: CardCode) {
  return SUIT_SYMBOLS[cardSuit(card)];
}

export function isRedCard(card: CardCode) {
  const suit = cardSuit(card);
  return suit === 'H' || suit === 'D';
}

export function cardTone(card: CardCode | null) {
  if (!card) return 'hidden';
  return isRedCard(card) ? 'red' : 'dark';
}

export function confidenceSlotTone(rank: number, owner: PlayerView | null, mySessionId: string) {
  if (owner?.id === mySessionId) return 'mine';
  if (owner) return 'claimed';
  return 'open';
}
