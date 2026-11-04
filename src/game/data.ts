import type {
  Faction,
  MilitaryCard,
  MilitaryType,
  ObjectiveCard,
} from './types';

// BASE_URL respeita o `base` do vite.config.ts (ex.: "/diesel/")
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const FACTION_IMG = 'cards/factions/';
const OBJECTIVE_IMG = 'cards/objectives/';
const MILITARY_IMG = 'cards/military/';

// ---------- Versos ----------
export const CARD_BACKS = {
  factions: asset(`${FACTION_IMG}verso_faccoes.jpg`),
  objectives: asset(`${OBJECTIVE_IMG}verso_objetivos.png`),
  military: asset(`${MILITARY_IMG}verso_unidades_militares.jpg`),
} as const;

// ---------- Facções ----------
export const FACTIONS: Faction[] = [
  {
    id: 'nova_america',
    name: 'Nova America',
    bonusType: 'maritimo',
    image: asset(`${FACTION_IMG}faccao_nova_america.jpg`),
  },
  {
    id: 'confederacao_europeia',
    name: 'Confederação Européia',
    bonusType: 'aereo',
    image: asset(`${FACTION_IMG}faccao_confederacao_europeia.jpg`),
  },
  {
    id: 'nacoes_islamicas',
    name: 'Nações Islâmicas',
    bonusType: 'terrestre',
    image: asset(`${FACTION_IMG}faccao_nacoes_islamicas.jpg`),
  },
  {
    id: 'imperio_asiatico',
    name: 'Império Asiático',
    bonusType: 'heroi',
    image: asset(`${FACTION_IMG}faccao_imperio_asiatico.jpg`),
  },
];

// ---------- Unidades Militares ----------
// Prefixos de arquivo → tipo
const TYPE_PREFIXES: { type: MilitaryType; prefix: string; label: string }[] = [
  { type: 'terrestre', prefix: 'T', label: 'Terrestre' },
  { type: 'aereo', prefix: 'A', label: 'Aéreo' },
  { type: 'maritimo', prefix: 'M', label: 'Marítimo' },
  { type: 'heroi', prefix: 'H', label: 'Herói' },
];

export const MILITARY_CARDS: MilitaryCard[] = TYPE_PREFIXES.flatMap(
  ({ type, prefix, label }) =>
    Array.from({ length: 10 }, (_, i) => {
      const value = i + 1;
      const file = `${prefix}${value}`; // ex.: "T1", "A7", "M10", "H3"
      return {
        id: file,
        name: `${label} ${value}`,
        value,
        type,
        image: asset(`${MILITARY_IMG}${file}.png`),
      };
    }),
);

// ---------- Objetivos ----------
// ATENÇÃO: nomes conforme você informou. Note a inconsistência entre
// "0" e "O" nos arquivos 07, 09, 10, 11 e 12 — ajuste se estiver errado no disco.
const OBJECTIVE_FILES: string[] = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  'O7',
  '08',
  'O9',
  'O10',
  'O11',
  'O12',
];

// TODO: preencher PV e texto de cada objetivo real do jogo.
export const OBJECTIVE_CARDS: ObjectiveCard[] = OBJECTIVE_FILES.map(
  (file, i) => ({
    id: `obj_${String(i + 1).padStart(2, '0')}`,
    name: `Objetivo ${i + 1}`,
    pv: 1,
    image: asset(`${OBJECTIVE_IMG}${file}.png`),
  }),
);

// ---------- Índices por ID ----------
export const MILITARY_BY_ID = Object.fromEntries(
  MILITARY_CARDS.map((c) => [c.id, c]),
);

export const OBJECTIVE_BY_ID = Object.fromEntries(
  OBJECTIVE_CARDS.map((c) => [c.id, c]),
);

export const FACTION_BY_ID = Object.fromEntries(
  FACTIONS.map((f) => [f.id, f]),
);