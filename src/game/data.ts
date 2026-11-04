import type {
  Faction,
  MilitaryCard,
  MilitaryType,
  ObjectiveCard,
} from './types';

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const FACTION_IMG = 'cards/factions/';
const OBJECTIVE_IMG = 'cards/objectives/';
const MILITARY_IMG = 'cards/military/';

export const CARD_BACKS = {
  factions: asset(`${FACTION_IMG}verso_faccoes.jpg`),
  objectives: asset(`${OBJECTIVE_IMG}verso_objetivos.jpg`),
  military: asset(`${MILITARY_IMG}verso_unidades_militares.jpg`),
} as const;

export const FACTIONS: Faction[] = [
  { id: 'nova_america', name: 'Nova America', bonusType: 'maritimo', image: asset(`${FACTION_IMG}faccao_nova_america.jpg`) },
  { id: 'confederacao_europeia', name: 'Confederação Européia', bonusType: 'aereo', image: asset(`${FACTION_IMG}faccao_confederacao_europeia.jpg`) },
  { id: 'nacoes_islamicas', name: 'Nações Islâmicas', bonusType: 'terrestre', image: asset(`${FACTION_IMG}faccao_nacoes_islamicas.jpg`) },
  { id: 'imperio_asiatico', name: 'Império Asiático', bonusType: 'heroi', image: asset(`${FACTION_IMG}faccao_imperio_asiatico.jpg`) },
];

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
      const file = `${prefix}${value}`;
      return {
        id: file,
        name: `${label} ${value}`,
        value,
        type,
        image: asset(`${MILITARY_IMG}${file}.png`),
      };
    }),
);

const OBJECTIVE_FILES: { file: string; name: string; text: string; effects: ObjectiveCard['effects'] }[] = [
  {
    file: '01',
    name: 'Base Submarina',
    text: 'Unidades terrestres não podem ser usadas. Unidades marítimas podem assumir valor +1 ou -1.',
    effects: [
      { kind: 'restrictType', type: 'terrestre' },
      { kind: 'valueAdjust', type: 'maritimo' },
    ],
  },
  {
    file: '02',
    name: 'Base do Deserto',
    text: 'Unidades marítimas não podem ser usadas.',
    effects: [{ kind: 'restrictType', type: 'maritimo' }],
  },
  {
    file: '03',
    name: 'Cidade Flutuante',
    text: 'Unidades aéreas podem assumir valor +1 ou -1.',
    effects: [{ kind: 'valueAdjust', type: 'aereo' }],
  },
  {
    file: '04',
    name: 'Base dos Canyons',
    text: 'Unidades terrestres de valor 5 ou menor podem assumir qualquer tipo.',
    effects: [{ kind: 'typeChange', type: 'terrestre', maxValue: 5 }],
  },
  {
    file: '05',
    name: 'Base da Selva',
    text: 'Unidades terrestres podem assumir valor +1 ou -1.',
    effects: [{ kind: 'valueAdjust', type: 'terrestre' }],
  },
  {
    file: '06',
    name: 'Base da Montanha',
    text: 'Cartas de Heróis podem assumir qualquer valor.',
    effects: [{ kind: 'anyValue', type: 'heroi' }],
  },
  {
    file: 'O7',
    name: 'Complexo Industrial',
    text: 'Após adquirir: a mão do jogador é ampliada para 4 cartas até o final da partida.',
    effects: [{ kind: 'postHandSize', bonus: 1 }],
  },
  {
    file: '08',
    name: 'Armadura Mecanizada',
    text: 'Após adquirir: uma carta de Herói no conflito pode assumir qualquer valor.',
    effects: [{ kind: 'postAnyValue', type: 'heroi' }],
  },
  {
    file: 'O9',
    name: 'Ultra Reator',
    text: 'Após adquirir: o jogador pode alterar o tipo de uma carta dele no conflito por qualquer outro tipo.',
    effects: [{ kind: 'postTypeChangeOwn' }],
  },
  {
    file: 'O10',
    name: 'Controlador Temporal',
    text: 'Após adquirir: a cada conflito o jogador pode substituir 1 carta do conflito por uma carta da mão.',
    effects: [{ kind: 'postSwapWithHand' }],
  },
  {
    file: 'O11',
    name: 'Complexo de Mineração Subterrâneo',
    text: 'Unidades aéreas não podem ser usadas.',
    effects: [{ kind: 'restrictType', type: 'aereo' }],
  },
  {
    file: 'O12',
    name: 'Cidade Móvel',
    text: 'São necessárias 4 cartas de unidades para iniciar o conflito na disputa por objetivo.',
    effects: [{ kind: 'conflictThreshold', threshold: 4 }],
  },
];

export const OBJECTIVE_CARDS: ObjectiveCard[] = OBJECTIVE_FILES.map((o, i) => ({
  id: `obj_${String(i + 1).padStart(2, '0')}`,
  name: o.name,
  pv: 1,
  text: o.text,
  image: asset(`${OBJECTIVE_IMG}${o.file}.png`),
  effects: o.effects,
}));

export const MILITARY_BY_ID = Object.fromEntries(MILITARY_CARDS.map((c) => [c.id, c]));
export const OBJECTIVE_BY_ID = Object.fromEntries(OBJECTIVE_CARDS.map((c) => [c.id, c]));
export const FACTION_BY_ID = Object.fromEntries(FACTIONS.map((f) => [f.id, f]));