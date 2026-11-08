export type MilitaryType = 'terrestre' | 'aereo' | 'maritimo' | 'heroi';

export interface MilitaryCard {
  id: string;
  name: string;
  value: number;
  type: MilitaryType;
  image: string;
}

/** Efeitos possíveis de uma Carta de Objetivo. */
export type ObjectiveEffect =
  | { kind: 'restrictType'; type: MilitaryType }
  | { kind: 'valueAdjust'; type: MilitaryType }
  | { kind: 'typeChange'; type: MilitaryType; maxValue?: number }
  | { kind: 'anyValue'; type: MilitaryType }
  | { kind: 'postAnyValue'; type: MilitaryType }
  | { kind: 'postHandSize'; bonus: number }
  | { kind: 'postTypeChangeOwn' }
  | { kind: 'postSwapWithHand' }
  | { kind: 'conflictThreshold'; threshold: number };

export interface ObjectiveCard {
  id: string;
  name: string;
  pv: number;
  text?: string;
  image: string;
  effects?: ObjectiveEffect[];
}

export interface Faction {
  id: string;
  name: string;
  bonusType: MilitaryType;
  image: string;
}

/** Nível de inteligência dos autômatos. */
export type AutomaDifficulty = 'easy' | 'medium' | 'hard';

export interface GameOptions {
  numPlayers: number;
  long: boolean;
  asymmetric: boolean;
  solo: boolean;
  automas: number;
  /** Nível de IA dos autômatos. Padrão: 'medium'. */
  difficulty?: AutomaDifficulty;
  /**
   * Regra de vitória especial do manual: "no modo solo você só vence
   * conquistando TODAS as Cartas de Objetivo."
   *
   * • `true` (padrão quando `solo`): condição binária, como no manual.
   * • `false`: comportamento competitivo padrão (maior PV vence) mesmo
   *   com autômatos em jogo — é o novo modo "Competitivo vs. Autômatos".
   *
   * Ignorado quando `solo === false`.
   */
  soloOnly?: boolean;
}

export interface PlayerState {
  id: string;
  factionId: string;
  hand: string[];
  objectivesWon: string[];
  isAutoma: boolean;
  /**
   * Nível de estratégia da mão — usado apenas como 2º critério de desempate
   * final (manual 2.0). Preenchido pelo motor; o `playerView` o exibe mesmo
   * quando a mão está oculta. É atualizado em cada mudança de mão.
   */
  handLevel: number;
}

export interface Attachment {
  playerId: string;
  cardId: string;
  revealed: boolean;
  valueMod: number;
  typeOverride: MilitaryType | null;
}

export interface BattlefieldSlot {
  objectiveId: string;
  attachments: Attachment[];
}

export interface ConfrontResult {
  objectiveId: string;
  winnerId: string;
  participants: {
    playerId: string;
    level: number;
    totalValue: number;
    description: string;
  }[];
}

export interface GameState {
  options: GameOptions;
  totalObjectives: number;
  players: Record<string, PlayerState>;
  militaryDeck: string[];
  militaryDiscard: string[];
  market: string[];
  objectiveDeck: string[];
  battlefield: BattlefieldSlot[];
  firstPlayer: string;
  automaSlot: Record<string, number>;
  hasAdvanced: boolean;
  pendingConfront: string | null;
  confrontTriggeredBy: string | null;
  reinforcePassed: string[];
  modifyQueue: string[];
  modifyDone: string[];
  resumeFrom: string | null;
  lastConfront: ConfrontResult | null;
  gameOver: boolean;
  winnerId: string | null;
}