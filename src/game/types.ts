export type MilitaryType = 'terrestre' | 'aereo' | 'maritimo' | 'heroi';

export interface MilitaryCard {
  id: string;
  name: string;
  value: number;
  type: MilitaryType;
  image: string;
}

export interface ObjectiveCard {
  id: string;
  name: string;
  pv: number;
  text?: string;
  image: string;
}

export interface Faction {
  id: string;
  name: string;
  bonusType: MilitaryType;
  image: string;
}

/** Regras escolhidas na tela inicial. */
export interface GameOptions {
  numPlayers: number; // jogadores humanos (modo hotseat, 2–4)
  long: boolean; // Partida Longa: usa os 12 objetivos
  asymmetric: boolean; // Facções Assimétricas
  solo: boolean; // Modo Solo
  automas: number; // 1–3 (só no modo solo)
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
  cardId: string; // '' quando a carta está oculta para quem vê
  revealed: boolean;
  valueMod: number; // +1 / -1 da vantagem de facção (0 = sem alteração)
  typeOverride: MilitaryType | null; // tipo alterado pela vantagem de facção
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

  // Modo solo: posição do Campo de Batalha atribuída a cada autômato
  automaSlot: Record<string, number>;

  // Controle do turno (Avanço -> Recrutamento)
  hasAdvanced: boolean;

  // Controle do Confronto
  pendingConfront: string | null;
  confrontTriggeredBy: string | null;
  reinforcePassed: string[];
  modifyQueue: string[]; // quem pode usar a vantagem de facção
  modifyDone: string[]; // quem já usou ou passou
  resumeFrom: string | null; // quem joga depois do confronto

  lastConfront: ConfrontResult | null;
  gameOver: boolean;
  winnerId: string | null;
}