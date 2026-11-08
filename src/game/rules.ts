// src/game/rules.ts
import type { GameState, ObjectiveEffect } from './types';
import { MILITARY_BY_ID, OBJECTIVE_BY_ID } from './data';

/** Tamanho base da mão — também usado no setup. */
export const HAND_SIZE = 3;

const DEFAULT_THRESHOLD = 3;

/** Efeitos de campo de batalha de um objetivo. */
export function objectiveEffects(objectiveId: string): ObjectiveEffect[] {
  return OBJECTIVE_BY_ID[objectiveId]?.effects ?? [];
}

/** Limiar de cartas para disparar conflito (3 por padrão; 4 para Cidade Móvel). */
export function conflictThreshold(objectiveId: string): number {
  const t = objectiveEffects(objectiveId).find(
    (e): e is { kind: 'conflictThreshold'; threshold: number } =>
      e.kind === 'conflictThreshold',
  );
  return t?.threshold ?? DEFAULT_THRESHOLD;
}

/** true se a carta é de tipo proibido no objetivo. */
export function isCardForbidden(cardId: string, objectiveId: string): boolean {
  const base = MILITARY_BY_ID[cardId];
  if (!base) return false;
  return objectiveEffects(objectiveId).some(
    (e) => e.kind === 'restrictType' && e.type === base.type,
  );
}

/** Tamanho máximo da mão do jogador (leva em conta Complexo Industrial). */
export function handSizeFor(G: GameState, pid: string): number {
  const won = G.players[pid]?.objectivesWon ?? [];
  const bonus = won.reduce((sum, objId) => {
    return sum + objectiveEffects(objId).reduce(
      (s, e) => s + (e.kind === 'postHandSize' ? e.bonus : 0),
      0,
    );
  }, 0);
  return HAND_SIZE + bonus;
}

/**
 * O jogador está impedido de jogar QUALQUER carta da mão em QUALQUER
 * slot? (manual 2.0 — "Outras regras": quem fica sem jogada compra do deck
 * até obter uma carta jogável).
 *
 * Considera:
 *  • restrições de tipo do objetivo;
 *  • limiar de conflito já atingido pelo jogador no slot.
 */
export function isStuck(G: GameState, pid: string): boolean {
  const me = G.players[pid];
  if (!me || me.isAutoma) return false;
  if (G.battlefield.length === 0) return true;
  for (const cardId of me.hand) {
    for (const slot of G.battlefield) {
      const mine = slot.attachments.filter((a) => a.playerId === pid).length;
      const thr = conflictThreshold(slot.objectiveId);
      if (mine >= thr) continue;
      if (isCardForbidden(cardId, slot.objectiveId)) continue;
      return false; // há pelo menos uma jogada válida
    }
  }
  return true;
}