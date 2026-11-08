import type { Attachment, MilitaryType } from './types';
import { MILITARY_BY_ID } from './data';

export const MIN_VALUE = 1;
export const MAX_VALUE = 10;

export const MILITARY_TYPES: MilitaryType[] = [
  'terrestre',
  'aereo',
  'maritimo',
  'heroi',
];

export const TYPE_LABEL: Record<MilitaryType, string> = {
  terrestre: 'Terrestre',
  aereo: 'Aéreo',
  maritimo: 'Marítimo',
  heroi: 'Herói',
};

export interface CardLike {
  value: number;
  type: MilitaryType;
}

export interface CombatScore {
  level: number;
  totalValue: number;
  description: string;
}

/**
 * Tabela de Estratégia (manual 2.0):
 *   1 — Sem estratégia (maior soma)
 *   2 — Ataque sincronizado (1 par)
 *   3 — Múltiplas frentes (3 tipos diferentes)
 *   4 — Força uniforme (3 mesmo tipo)
 *   5 — Coordenação total (sequência de 3)
 *   6 — Operação conjunta (3 mesmo valor)
 *   7 — Estratégia implacável (sequência de 3 do mesmo tipo)
 */
const LEVEL_DESC: Record<number, string> = {
  1: 'Sem estratégia (soma)',
  2: 'Ataque sincronizado (par)',
  3: 'Múltiplas frentes (3 tipos)',
  4: 'Força uniforme (3 tipo)',
  5: 'Coordenação total (sequência)',
  6: 'Operação conjunta (3 valor)',
  7: 'Estratégia implacável (sequência + tipo)',
};

/** Carta com as modificações de facção aplicadas (valor e tipo efetivos). */
export function effectiveCard(
  att: Pick<Attachment, 'cardId' | 'valueMod' | 'typeOverride'>,
): CardLike | null {
  const base = MILITARY_BY_ID[att.cardId];
  if (!base) return null;
  return {
    value: base.value + att.valueMod,
    type: att.typeOverride ?? base.type,
  };
}

/** Melhor nível de combate possível para um conjunto de cartas. */
export function bestScoreFromCards(cards: CardLike[]): CombatScore {
  const n = cards.length;
  const patterns: { mask: number; level: number }[] = [];

  // Nível 2 — par
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (cards[i].value === cards[j].value)
        patterns.push({ mask: (1 << i) | (1 << j), level: 2 });

  // Combinações de 3 cartas — níveis 3, 4, 5, 6, 7
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const mask = (1 << i) | (1 << j) | (1 << k);
        const trio = [cards[i], cards[j], cards[k]];
        const vals = trio.map((c) => c.value).sort((a, b) => a - b);

        const sameType = trio.every((c) => c.type === trio[0].type);
        const allDifferentTypes =
          trio[0].type !== trio[1].type &&
          trio[0].type !== trio[2].type &&
          trio[1].type !== trio[2].type;

        const sameValue = vals[0] === vals[2];
        const sequence = vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1;

        // Nível 3 — Múltiplas frentes (3 tipos diferentes)
        if (allDifferentTypes) patterns.push({ mask, level: 3 });

        // Nível 4 — Força uniforme (3 cartas do mesmo tipo)
        if (sameType) patterns.push({ mask, level: 4 });

        // Nível 5 — Coordenação total (sequência de 3)
        if (sequence) patterns.push({ mask, level: 5 });

        // Nível 6 — Operação conjunta (3 cartas de mesmo valor)
        if (sameValue) patterns.push({ mask, level: 6 });

        // Nível 7 — Estratégia implacável (sequência de 3 do mesmo tipo)
        if (sequence && sameType) patterns.push({ mask, level: 7 });
      }

  // Melhor combinação de padrões SEM sobreposição de cartas
  // (manual 2.0, Obs. 1: uma carta só pode compor uma combinação).
  const solve = (start: number, used: number): number => {
    let best = 0;
    for (let p = start; p < patterns.length; p++) {
      const { mask, level } = patterns[p];
      if (used & mask) continue;
      best = Math.max(best, level + solve(p + 1, used | mask));
    }
    return best;
  };

  const level = solve(0, 0) || 1;
  const totalValue = cards.reduce((s, c) => s + c.value, 0);

  return {
    level,
    totalValue,
    description: LEVEL_DESC[level] ?? LEVEL_DESC[1],
  };
}

/** Pontuação de um jogador a partir das cartas anexadas (com modificações). */
export function scoreAttachments(atts: Attachment[]): CombatScore {
  const cards = atts
    .map(effectiveCard)
    .filter((c): c is CardLike => c !== null);
  return bestScoreFromCards(cards);
}

/** Retorna > 0 se `a` é melhor que `b` (nível, depois soma). */
export function compareScore(a: CombatScore, b: CombatScore): number {
  if (a.level !== b.level) return a.level - b.level;
  return a.totalValue - b.totalValue;
}

/**
 * Nível de estratégia da mão (para o desempate final do manual 2.0).
 * Usa as cartas da mão como se fossem um conjunto de combate — apenas o
 * `level` importa para o desempate. Retorna 0 se a mão estiver vazia.
 */
export function handStrategyLevel(handIds: string[]): number {
  const cards: CardLike[] = handIds
    .map((id) => MILITARY_BY_ID[id])
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => ({ value: c.value, type: c.type }));
  if (cards.length === 0) return 0;
  return bestScoreFromCards(cards).level;
}