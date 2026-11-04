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

const LEVEL_DESC: Record<number, string> = {
  1: 'Sem estratégia (soma)',
  2: 'Ataque sincronizado (par)',
  3: 'Força uniforme (3 tipo)',
  4: 'Coordenação total (sequência)',
  5: 'Operação conjunta (3 valor)',
  6: 'Estratégia implacável (sequência + tipo)',
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

  // Trincas (3 cartas): níveis 3, 4, 5 e 6
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const mask = (1 << i) | (1 << j) | (1 << k);
        const trio = [cards[i], cards[j], cards[k]];
        const vals = trio.map((c) => c.value).sort((a, b) => a - b);
        const sameType = trio.every((c) => c.type === trio[0].type);
        const sameValue = vals[0] === vals[2];
        const sequence = vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1;

        if (sameValue) patterns.push({ mask, level: 5 });
        if (sameType) patterns.push({ mask, level: 3 });
        if (sequence) {
          patterns.push({ mask, level: 4 });
          if (sameType) patterns.push({ mask, level: 6 });
        }
      }

  // Melhor combinação de padrões SEM sobreposição de cartas
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