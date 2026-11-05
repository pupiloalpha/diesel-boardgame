export type MilitaryType = 'terrestre' | 'aereo' | 'maritimo' | 'heroi';

/** Nível de inteligência dos autômatos. */
export type AutomaDifficulty = 'easy' | 'medium' | 'hard';

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

export interface GameOptions {
  numPlayers: number;
  long: boolean;
  asymmetric: boolean;
  solo: boolean;
  automas: number;
  /** Nível de IA dos autômatos. Padrão: 'medium'. */
  difficulty?: AutomaDifficulty;
}

export interface PlayerState {
  id: string;
  factionId: string;
  hand: string[];
  objectivesWon: string[];
  isAutoma: boolean;
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