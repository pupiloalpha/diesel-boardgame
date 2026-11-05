// src/game/automa.ts
import type { Attachment, BattlefieldSlot, GameState } from './types';
import type { CombatScore } from './combos';
import { MILITARY_BY_ID } from './data';
import { isCardForbidden } from './rules';
import { compareScore, scoreAttachments } from './combos';
import type { AutomaDifficulty } from './types';

type Rng = { Shuffle: <T>(deck: T[]) => T[]; Number: () => number };

/** Lê a dificuldade escolhida no setup (com fallback). */
export function difficultyOf(G: Pick<GameState, 'options'>): AutomaDifficulty {
  return (G.options.difficulty ?? 'medium') as AutomaDifficulty;
}

/** Índices do mercado cujo tipo não é proibido no objetivo. */
function validMarketIndices(G: GameState, objectiveId: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < G.market.length; i++) {
    if (!isCardForbidden(G.market[i], objectiveId)) out.push(i);
  }
  return out;
}

function attachmentsOf(slot: BattlefieldSlot, pid: string): Attachment[] {
  return slot.attachments.filter((a) => a.playerId === pid);
}

/** Score final do autômato se adicionasse `cardId` ao slot. */
function scoreWith(slot: BattlefieldSlot, pid: string, cardId: string): CombatScore {
  return scoreAttachments([
    ...attachmentsOf(slot, pid),
    { playerId: pid, cardId, revealed: true, valueMod: 0, typeOverride: null },
  ]);
}

/* ------------------------------------------------------------------ */
/* Escolha de carta no Mercado                                         */
/* ------------------------------------------------------------------ */

/**
 * Retorna o índice da carta do Mercado que o autômato deve comprar.
 * `undefined` significa "não há carta válida → tente o deck".
 *
 * • easy  → sorteia um índice válido.
 * • médio/difícil → a carta que maximiza o score do autômato no slot,
 *   desempatando por maior valor efetivo (importante no desempate de confronto).
 */
export function pickMarketCardIndex(
  G: GameState,
  pid: string,
  slot: BattlefieldSlot,
  random: Rng,
): number | undefined {
  const valid = validMarketIndices(G, slot.objectiveId);
  if (valid.length === 0) return undefined;

  if (difficultyOf(G) === 'easy') {
    return valid[Math.floor(random.Number() * valid.length)];
  }

  let bestIdx: number | undefined;
  let bestScore: CombatScore | null = null;
  let bestValue = -1;

  for (const idx of valid) {
    const cardId = G.market[idx];
    const score = scoreWith(slot, pid, cardId);
    const value = MILITARY_BY_ID[cardId]?.value ?? 0;
    const cmp = bestScore ? compareScore(score, bestScore) : 1;
    if (cmp > 0 || (cmp === 0 && value > bestValue)) {
      bestIdx = idx;
      bestScore = score;
      bestValue = value;
    }
  }
  return bestIdx;
}

/* ------------------------------------------------------------------ */
/* Reforço no confronto                                                */
/* ------------------------------------------------------------------ */

/**
 * Decide se (e com qual carta) o autômato reforça o confronto.
 * Retorna o índice do Mercado ou `undefined` para passar.
 *
 * Regras respeitadas:
 *  • só age quando o slot em disputa é o slot fixo do autômato
 *    (manual: "cada facção adiciona cartas apenas a 1 Objetivo");
 *  • só reforça no modo difícil;
 *  • só olha cartas REVELADAS dos oponentes (sem espiar ocultas);
 *  • só reforça se o resultado final fizer o autômato superar todos os
 *    oponentes visíveis — caso contrário, passa (evita desperdiçar carta).
 */
export function shouldReinforce(
  G: GameState,
  pid: string,
  slot: BattlefieldSlot,
): number | undefined {
  if (difficultyOf(G) !== 'hard') return undefined;

  const mySlotIdx = G.automaSlot[pid];
  const slotIdx = G.battlefield.findIndex((s) => s.objectiveId === slot.objectiveId);
  if (slotIdx < 0 || mySlotIdx !== slotIdx) return undefined;

  const valid = validMarketIndices(G, slot.objectiveId);
  if (valid.length === 0) return undefined;

  // Melhor score possível com UM reforço.
  let bestIdx: number | undefined;
  let bestScore: CombatScore | null = null;
  for (const idx of valid) {
    const s = scoreWith(slot, pid, G.market[idx]);
    if (!bestScore || compareScore(s, bestScore) > 0) {
      bestScore = s;
      bestIdx = idx;
    }
  }
  if (!bestScore || bestIdx === undefined) return undefined;

  // Melhor score visível dos oponentes (só cartas reveladas).
  const oppScores: CombatScore[] = [];
  for (const [opid, atts] of groupByPlayer(slot.attachments)) {
    if (opid === pid) continue;
    const visible = atts.filter((a) => a.revealed);
    if (visible.length > 0) oppScores.push(scoreAttachments(visible));
  }
  const bestOpp = oppScores.reduce<CombatScore | null>(
    (best, s) => (!best || compareScore(s, best) > 0 ? s : best),
    null,
  );

  if (!bestOpp) return bestIdx;              // nenhum oponente visível → reforça
  if (compareScore(bestScore, bestOpp) > 0) return bestIdx;
  return undefined;                          // não viraria o jogo → passa
}

function groupByPlayer(atts: Attachment[]): Map<string, Attachment[]> {
  const map = new Map<string, Attachment[]>();
  for (const a of atts) {
    const list = map.get(a.playerId) ?? [];
    list.push(a);
    map.set(a.playerId, list);
  }
  return map;
}