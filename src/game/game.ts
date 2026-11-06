// src/game/game.ts
import type { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type {
  Attachment,
  BattlefieldSlot,
  ConfrontResult,
  GameOptions,
  GameState,
  MilitaryType,
  PlayerState,
} from './types';
import {
  FACTIONS,
  FACTION_BY_ID,
  MILITARY_BY_ID,
  MILITARY_CARDS,
  OBJECTIVE_BY_ID,
  OBJECTIVE_CARDS,
} from './data';
import {
  MAX_VALUE,
  MILITARY_TYPES,
  MIN_VALUE,
  compareScore,
  scoreAttachments,
} from './combos';
import {
  HAND_SIZE,
  objectiveEffects,
  conflictThreshold,
  isCardForbidden,
  handSizeFor,
} from './rules';
import {
  pickMarketCardIndex,
  shouldReinforce,
} from './automa';

// Re-exporta os helpers (compatibilidade com importadores existentes).
export {
  HAND_SIZE,
  objectiveEffects,
  conflictThreshold,
  isCardForbidden,
  handSizeFor,
} from './rules';

const BATTLEFIELD_SIZE = 3;
const MARKET_SIZE = 3;
const OBJECTIVE_DECK_SIZE = 7;

type Rng = { Shuffle: <T>(deck: T[]) => T[]; Number: () => number };
type ModMode = 'plus' | 'minus' | 'type';
interface Modification { mode: ModMode; newType?: MilitaryType }

export function totalPlayers(o: GameOptions): number {
  return o.solo ? 1 + o.automas : o.numPlayers;
}

function shuffle<T>(arr: T[], random: Rng): T[] {
  return random.Shuffle([...arr]);
}

function setupPlayers(numPlayers: number, solo: boolean, random: Rng): Record<string, PlayerState> {
  const shuffled = shuffle(FACTIONS, random);
  const players: Record<string, PlayerState> = {};
  for (let i = 0; i < numPlayers; i++) {
    players[String(i)] = {
      id: String(i),
      factionId: shuffled[i]?.id ?? 'nova_america',
      hand: [],
      objectivesWon: [],
      isAutoma: solo && i > 0,
    };
  }
  return players;
}

function drawFromDeck(G: GameState, random: Rng): string | undefined {
  if (G.militaryDeck.length === 0 && G.militaryDiscard.length > 0) {
    G.militaryDeck = shuffle(G.militaryDiscard, random);
    G.militaryDiscard = [];
  }
  return G.militaryDeck.shift();
}

function pendingSlot(G: GameState): BattlefieldSlot | undefined {
  return G.battlefield.find((s) => s.objectiveId === G.pendingConfront);
}

function currentType(att: Attachment): MilitaryType | null {
  const base = MILITARY_BY_ID[att.cardId];
  if (!base) return null;
  return att.typeOverride ?? base.type;
}

function currentValue(att: Attachment): number | null {
  const base = MILITARY_BY_ID[att.cardId];
  if (!base) return null;
  return base.value + att.valueMod;
}

/* ------------------------------------------------------------------ */
/* Validação (exportada para a UI)                                     */
/* ------------------------------------------------------------------ */

export function validateModify(
  G: GameState,
  pid: string,
  att: Attachment,
  slot: BattlefieldSlot,
  mode: ModMode,
  newType?: MilitaryType,
): boolean {
  const base = MILITARY_BY_ID[att.cardId];
  if (!base) return false;
  const type = currentType(att)!;
  const value = currentValue(att)!;

  if (G.options.asymmetric) {
    const bonus = FACTION_BY_ID[G.players[pid].factionId].bonusType;
    if (type === bonus) {
      if (mode === 'plus' && value < MAX_VALUE) return true;
      if (mode === 'minus' && value > MIN_VALUE) return true;
      if (mode === 'type' && newType && newType !== type) return true;
    }
  }

  for (const eff of objectiveEffects(slot.objectiveId)) {
    if (eff.kind === 'valueAdjust' && type === eff.type) {
      if (mode === 'plus' && value < MAX_VALUE) return true;
      if (mode === 'minus' && value > MIN_VALUE) return true;
    }
    if (eff.kind === 'typeChange' && type === eff.type) {
      const withinLimit = eff.maxValue === undefined || value <= eff.maxValue;
      if (withinLimit && mode === 'type' && newType && newType !== type) return true;
    }
  }

  if (G.players[pid].objectivesWon.includes('obj_09')) {
    if (mode === 'type' && newType && newType !== type) return true;
  }
  return false;
}

export function validateSetValue(
  G: GameState,
  pid: string,
  att: Attachment,
  slot: BattlefieldSlot,
  targetValue: number,
): boolean {
  if (targetValue < MIN_VALUE || targetValue > MAX_VALUE) return false;
  const type = currentType(att);
  if (!type) return false;

  for (const eff of objectiveEffects(slot.objectiveId)) {
    if (eff.kind === 'anyValue' && type === eff.type) return true;
  }
  if (G.players[pid].objectivesWon.includes('obj_08') && type === 'heroi') return true;
  return false;
}

export function validateSwap(
  G: GameState,
  pid: string,
  _att: Attachment,
  slot: BattlefieldSlot,
  newCardId: string,
): boolean {
  if (!G.players[pid].objectivesWon.includes('obj_10')) return false;
  if (!G.players[pid].hand.includes(newCardId)) return false;
  const newBase = MILITARY_BY_ID[newCardId];
  if (!newBase) return false;
  if (isCardForbidden(newCardId, slot.objectiveId)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Aplicação de modificação                                            */
/* ------------------------------------------------------------------ */

function applyModification(att: Attachment, mod: Modification): boolean {
  const base = MILITARY_BY_ID[att.cardId];
  if (!base) return false;
  const currentValue_ = base.value + att.valueMod;
  const currentType_ = att.typeOverride ?? base.type;

  if (mod.mode === 'plus') {
    if (currentValue_ + 1 > MAX_VALUE) return false;
    att.valueMod += 1;
    return true;
  }
  if (mod.mode === 'minus') {
    if (currentValue_ - 1 < MIN_VALUE) return false;
    att.valueMod -= 1;
    return true;
  }
  if (!mod.newType || !MILITARY_TYPES.includes(mod.newType) || mod.newType === currentType_) {
    return false;
  }
  att.typeOverride = mod.newType;
  return true;
}

/* ------------------------------------------------------------------ */
/* Elegibilidade para a fase de modificação                            */
/* ------------------------------------------------------------------ */

function canModify(G: GameState, pid: string, slot: BattlefieldSlot): boolean {
  const mine = slot.attachments.filter((a) => a.playerId === pid);
  if (mine.length === 0) return false;

  if (G.options.asymmetric) {
    const bonus = FACTION_BY_ID[G.players[pid].factionId].bonusType;
    if (mine.some((a) => currentType(a) === bonus)) return true;
  }

  for (const eff of objectiveEffects(slot.objectiveId)) {
    if (eff.kind === 'valueAdjust' || eff.kind === 'anyValue') {
      if (mine.some((a) => currentType(a) === eff.type)) return true;
    }
    if (eff.kind === 'typeChange') {
      if (mine.some((a) => {
        const t = currentType(a);
        const v = currentValue(a);
        return t === eff.type && v !== null && (eff.maxValue === undefined || v <= eff.maxValue);
      })) return true;
    }
  }

  const won = G.players[pid].objectivesWon;
  if (won.includes('obj_08') && mine.some((a) => currentType(a) === 'heroi')) return true;
  if (won.includes('obj_09') && mine.length > 0) return true;
  if (!G.players[pid].isAutoma && won.includes('obj_10') && mine.length > 0 && G.players[pid].hand.length > 0) return true;

  return false;
}

function eligibleModifiers(G: GameState): string[] {
  if (!G.pendingConfront) return [];
  const slot = pendingSlot(G);
  if (!slot) return [];
  const n = Object.keys(G.players).length;
  const start = Number(G.confrontTriggeredBy) + 1;
  const result: string[] = [];
  for (let k = 0; k < n; k++) {
    const pid = String((start + k) % n);
    if (canModify(G, pid, slot)) result.push(pid);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Resolução do confronto                                              */
/* ------------------------------------------------------------------ */

function fixAutomaSlots(G: GameState, removedIdx: number) {
  for (const pid of Object.keys(G.automaSlot)) {
    const cur = G.automaSlot[pid];
    if (cur > removedIdx) G.automaSlot[pid] = cur - 1;
    else if (cur === removedIdx) G.automaSlot[pid] = Math.min(removedIdx, Math.max(G.battlefield.length - 1, 0));
  }
}

export function totalPV(G: Pick<GameState, 'players'>, pid: string): number {
  return G.players[pid].objectivesWon.reduce((sum, objId) => sum + (OBJECTIVE_BY_ID[objId]?.pv ?? 0), 0);
}

export interface Standing {
  playerId: string;
  pv: number;
  objectives: number;
}

export function rankPlayers(
  G: Pick<GameState, 'players' | 'firstPlayer'>,
  pool?: string[],
): Standing[] {
  const n = Object.keys(G.players).length;
  const distance = (pid: string) => (Number(pid) - Number(G.firstPlayer) + n) % n;
  return (pool ?? Object.keys(G.players))
    .map((playerId) => ({
      playerId,
      pv: totalPV(G, playerId),
      objectives: G.players[playerId].objectivesWon.length,
    }))
    .sort((a, b) => b.pv - a.pv || distance(b.playerId) - distance(a.playerId));
}

export function remainingObjectives(G: Pick<GameState, 'objectiveDeck' | 'battlefield'>): number {
  return G.objectiveDeck.length + G.battlefield.length;
}

/**
 * Etapa 4 — SUPREMACIA.
 *
 * • Competitivo padrão (hotseat) ou "Competitivo vs Autômatos": maior PV
 *   vence. Empate: jogador mais distante do primeiro em sentido horário.
 * • Solo clássico (manual): "você só vence se conquistar TODAS as Cartas
 *   de Objetivo". Resultado binário: `winnerId = '0'` (vitória) ou `null`
 *   (derrota). Não há "autômato vencedor".
 *
 * A distinção é feita por `G.options.soloOnly` (default `true` quando
 * `G.options.solo`). Isso desacopla "há autômatos?" de "qual é a regra
 * de vitória?".
 */
function checkSupremacy(G: GameState) {
  if (remainingObjectives(G) > 0) return;

  G.gameOver = true;

  const soloVictoryRule = G.options.solo && (G.options.soloOnly ?? true);
  if (soloVictoryRule) {
    const humanWon = G.players['0'].objectivesWon.length >= G.totalObjectives;
    G.winnerId = humanWon ? '0' : null;
    return;
  }

  // Competitivo padrão: ranking geral por PV.
  G.winnerId = rankPlayers(G)[0].playerId;
}

function resolveConfront(G: GameState, numPlayers: number) {
  const triggerer = G.confrontTriggeredBy;
  const slotIdx = G.battlefield.findIndex((s) => s.objectiveId === G.pendingConfront);

  const clearConfrontState = () => {
    G.pendingConfront = null;
    G.confrontTriggeredBy = null;
    G.reinforcePassed = [];
    G.modifyQueue = [];
    G.modifyDone = [];
    G.hasAdvanced = false;
  };

  if (slotIdx < 0) { clearConfrontState(); return; }

  const slot = G.battlefield[slotIdx];
  const byPlayer: Record<string, Attachment[]> = {};
  for (const att of slot.attachments) (byPlayer[att.playerId] ??= []).push(att);

  const participants = Object.keys(byPlayer).map((playerId) => {
    const s = scoreAttachments(byPlayer[playerId]);
    return { playerId, level: s.level, totalValue: s.totalValue, description: s.description };
  });

  participants.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue;
    const da = (Number(a.playerId) - Number(G.firstPlayer) + numPlayers) % numPlayers;
    const db = (Number(b.playerId) - Number(G.firstPlayer) + numPlayers) % numPlayers;
    return db - da;
  });

  const winner = participants[0];
  if (winner) G.players[winner.playerId].objectivesWon.push(slot.objectiveId);

  G.militaryDiscard.push(...slot.attachments.map((a) => a.cardId));

  const objectiveId = slot.objectiveId;
  const nextObj = G.objectiveDeck.shift();
  if (nextObj) G.battlefield[slotIdx] = { objectiveId: nextObj, attachments: [] };
  else { G.battlefield.splice(slotIdx, 1); fixAutomaSlots(G, slotIdx); }

  checkSupremacy(G);

  const result: ConfrontResult = {
    objectiveId, winnerId: winner?.playerId ?? '', participants,
  };
  G.lastConfront = result;

  if (triggerer !== null) G.resumeFrom = String((Number(triggerer) + 1) % numPlayers);
  clearConfrontState();
}

/* ------------------------------------------------------------------ */
/* Automa: busca de carta no mercado ou deck                           */
/* ------------------------------------------------------------------ */

function automaFindCard(
  G: GameState,
  pid: string,
  slot: BattlefieldSlot,
  random: Rng,
): string | undefined {
  // 1) Mercado — decisão delegada ao módulo de IA (varia por dificuldade).
  const idx = pickMarketCardIndex(G, pid, slot, random);
  if (idx !== undefined) {
    const [card] = G.market.splice(idx, 1);
    const next = drawFromDeck(G, random);
    if (next) G.market.push(next);
    return card;
  }
  // 2) Fallback: deck (descarta as proibidas).
  for (let attempt = 0; attempt < 30; attempt++) {
    const c = drawFromDeck(G, random);
    if (!c) return undefined;
    if (!isCardForbidden(c, slot.objectiveId)) return c;
    G.militaryDiscard.push(c);
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Jogo                                                                */
/* ------------------------------------------------------------------ */

export function createDiesel(options: GameOptions): Game<GameState> {
  return {
    name: 'diesel',

    setup: ({ ctx, random }): GameState => {
      const players = setupPlayers(ctx.numPlayers, options.solo, random);
      const militaryDeck = shuffle(MILITARY_CARDS.map((c) => c.id), random);
      const objectiveCount = options.long ? OBJECTIVE_CARDS.length : OBJECTIVE_DECK_SIZE;
      const objectiveDeck = shuffle(OBJECTIVE_CARDS.map((c) => c.id), random).slice(0, objectiveCount);
      const battlefield = objectiveDeck.splice(0, BATTLEFIELD_SIZE).map((objectiveId) => ({ objectiveId, attachments: [] }));
      const market = militaryDeck.splice(0, MARKET_SIZE);
      for (const pid of Object.keys(players)) players[pid].hand = militaryDeck.splice(0, HAND_SIZE);
      const automaSlot: Record<string, number> = {};
      for (const pid of Object.keys(players)) {
        if (players[pid].isAutoma) automaSlot[pid] = Math.floor(random.Number() * BATTLEFIELD_SIZE);
      }
      return {
        options, totalObjectives: objectiveCount, players,
        militaryDeck, militaryDiscard: [], market, objectiveDeck, battlefield,
        firstPlayer: '0', automaSlot, hasAdvanced: false,
        pendingConfront: null, confrontTriggeredBy: null,
        reinforcePassed: [], modifyQueue: [], modifyDone: [],
        resumeFrom: null, lastConfront: null, gameOver: false, winnerId: null,
      };
    },

    phases: {
      play: {
        start: true,
        next: 'reinforce',
        turn: {
          order: {
            first: ({ G }) => (G.resumeFrom !== null ? Number(G.resumeFrom) : 0),
            next: ({ ctx }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
          },
          onBegin: ({ G }) => { G.hasAdvanced = false; },
        },
        moves: {
          advance: {
            client: false,
            move: ({ G, ctx }, cardId: string, objectiveId: string) => {
              const pid = ctx.currentPlayer;
              if (G.hasAdvanced || G.pendingConfront) return INVALID_MOVE;
              const me = G.players[pid];
              if (!me || me.isAutoma || !me.hand.includes(cardId)) return INVALID_MOVE;

              const slot = G.battlefield.find((s) => s.objectiveId === objectiveId);
              if (!slot) return INVALID_MOVE;
              if (isCardForbidden(cardId, objectiveId)) return INVALID_MOVE;

              const mine = slot.attachments.filter((a) => a.playerId === pid).length;
              const threshold = conflictThreshold(objectiveId);
              if (mine >= threshold) return INVALID_MOVE;

              slot.attachments.push({
                playerId: pid, cardId, revealed: mine === 0, valueMod: 0, typeOverride: null,
              });
              me.hand = me.hand.filter((id) => id !== cardId);
              G.hasAdvanced = true;

              if (mine + 1 === threshold) {
                G.pendingConfront = objectiveId;
                G.confrontTriggeredBy = pid;
                G.reinforcePassed = [];
              }
            },
          },

          recruit: {
            client: false,
            move: ({ G, ctx, events, random }, source: 'market' | 'deck', marketIndex?: number) => {
              if (!G.hasAdvanced) return INVALID_MOVE;
              const me = G.players[ctx.currentPlayer];
              const maxHand = handSizeFor(G, ctx.currentPlayer);
              if (!me || me.isAutoma || me.hand.length >= maxHand) return INVALID_MOVE;

              const nothingToDraw = G.market.length === 0 && G.militaryDeck.length === 0 && G.militaryDiscard.length === 0;
              if (!nothingToDraw) {
                if (source === 'market') {
                  if (typeof marketIndex !== 'number' || marketIndex < 0 || marketIndex >= G.market.length) return INVALID_MOVE;
                  const [card] = G.market.splice(marketIndex, 1);
                  me.hand.push(card);
                  const next = drawFromDeck(G, random);
                  if (next) G.market.push(next);
                } else {
                  const next = drawFromDeck(G, random);
                  if (!next) return INVALID_MOVE;
                  me.hand.push(next);
                }
              }

              if (G.pendingConfront) events.setPhase('reinforce');
              else events.endTurn();
            },
          },

          automaTurn: {
            client: false,
            move: ({ G, ctx, events, random }) => {
              const pid = ctx.currentPlayer;
              const me = G.players[pid];
              if (!me || !me.isAutoma || G.pendingConfront) return INVALID_MOVE;

              const slot = G.battlefield[G.automaSlot[pid]] ?? G.battlefield[0];
              if (!slot) { events.endTurn(); return; }

              const threshold = conflictThreshold(slot.objectiveId);
              const mine = slot.attachments.filter((a) => a.playerId === pid).length;
              if (mine >= threshold) { events.endTurn(); return; }

              const card = automaFindCard(G, pid, slot, random);
              if (!card) { events.endTurn(); return; }

              slot.attachments.push({
                playerId: pid, cardId: card, revealed: true, valueMod: 0, typeOverride: null,
              });

              if (mine + 1 === threshold) {
                G.pendingConfront = slot.objectiveId;
                G.confrontTriggeredBy = pid;
                G.reinforcePassed = [];
                events.setPhase('reinforce');
              } else {
                events.endTurn();
              }
            },
          },
        },
      },

      reinforce: {
        next: 'play',
        turn: {
          order: {
            first: ({ G, ctx }) => (Number(G.confrontTriggeredBy) + 1) % ctx.numPlayers,
            next: ({ G, ctx }) => {
              let n = (ctx.playOrderPos + 1) % ctx.numPlayers;
              if (String(ctx.playOrder[n]) === G.confrontTriggeredBy) n = (n + 1) % ctx.numPlayers;
              return n;
            },
          },
          minMoves: 1,
          maxMoves: 1,
        },
        moves: {
          reinforceCard: {
            client: false,
            move: ({ G, ctx, random }, cardId: string) => {
              const pid = ctx.currentPlayer;
              if (!G.pendingConfront) return INVALID_MOVE;
              if (pid === G.confrontTriggeredBy) return INVALID_MOVE;
              if (G.reinforcePassed.includes(pid)) return INVALID_MOVE;

              const me = G.players[pid];
              if (!me || me.isAutoma || !me.hand.includes(cardId)) return INVALID_MOVE;

              const slot = pendingSlot(G);
              if (!slot) return INVALID_MOVE;
              if (isCardForbidden(cardId, slot.objectiveId)) return INVALID_MOVE;

              slot.attachments.push({
                playerId: pid, cardId, revealed: false, valueMod: 0, typeOverride: null,
              });
              me.hand = me.hand.filter((id) => id !== cardId);

              const maxHand = handSizeFor(G, pid);
              while (me.hand.length < maxHand) {
                const next = drawFromDeck(G, random);
                if (!next) break;
                me.hand.push(next);
              }
              G.reinforcePassed.push(pid);
            },
          },

          passReinforce: {
            client: false,
            move: ({ G, ctx }) => {
              const pid = ctx.currentPlayer;
              if (!G.pendingConfront) return INVALID_MOVE;
              if (pid === G.confrontTriggeredBy) return INVALID_MOVE;
              if (G.reinforcePassed.includes(pid)) return INVALID_MOVE;
              G.reinforcePassed.push(pid);
            },
          },

          /**
           * Move específico do autômato para a fase de Reforços.
           * Decide reforçar (puxando direto do Mercado) ou passar, com
           * base em `shouldReinforce` (varia conforme a dificuldade).
           */
          automaReinforce: {
            client: false,
            move: ({ G, ctx, random }) => {
              const pid = ctx.currentPlayer;
              const me = G.players[pid];
              if (!me?.isAutoma) return INVALID_MOVE;
              if (!G.pendingConfront) return INVALID_MOVE;
              if (pid === G.confrontTriggeredBy) return INVALID_MOVE;
              if (G.reinforcePassed.includes(pid)) return INVALID_MOVE;

              const slot = pendingSlot(G);
              if (!slot) return INVALID_MOVE;

              const idx = shouldReinforce(G, pid, slot);
              if (idx === undefined) {
                G.reinforcePassed.push(pid);
                return;
              }

              const [cardId] = G.market.splice(idx, 1);
              const next = drawFromDeck(G, random);
              if (next) G.market.push(next);

              slot.attachments.push({
                playerId: pid, cardId, revealed: false, valueMod: 0, typeOverride: null,
              });
              G.reinforcePassed.push(pid);
            },
          },
        },

        endIf: ({ G, ctx }) => {
          if (G.reinforcePassed.length < ctx.numPlayers - 1) return false;
          return { next: eligibleModifiers(G).length > 0 ? 'modify' : 'play' };
        },

        onEnd: ({ G, ctx }) => {
          const queue = eligibleModifiers(G);
          if (queue.length > 0) {
            const slot = pendingSlot(G);
            slot?.attachments.forEach((a) => { a.revealed = true; });
            G.modifyQueue = queue;
            G.modifyDone = [];
          } else {
            resolveConfront(G, ctx.numPlayers);
          }
        },
      },

      modify: {
        next: 'play',
        turn: {
          order: {
            first: ({ G }) => Number(G.modifyQueue[0]),
            next: ({ G }) => Number(G.modifyQueue[G.modifyDone.length] ?? G.modifyQueue[0]),
          },
          minMoves: 1,
          maxMoves: 1,
        },
        moves: {
          modifyCard: {
            client: false,
            move: ({ G, ctx }, attIndex: number, mode: ModMode, newType?: MilitaryType) => {
              const pid = ctx.currentPlayer;
              if (!G.pendingConfront) return INVALID_MOVE;
              if (!G.modifyQueue.includes(pid)) return INVALID_MOVE;
              if (G.modifyDone.includes(pid)) return INVALID_MOVE;
              if (G.players[pid].isAutoma) return INVALID_MOVE;

              const slot = pendingSlot(G);
              const att = slot?.attachments[attIndex];
              if (!att || att.playerId !== pid) return INVALID_MOVE;

              if (!validateModify(G, pid, att, slot!, mode, newType)) return INVALID_MOVE;
              if (!applyModification(att, { mode, newType })) return INVALID_MOVE;
              G.modifyDone.push(pid);
            },
          },

          setCardValue: {
            client: false,
            move: ({ G, ctx }, attIndex: number, targetValue: number) => {
              const pid = ctx.currentPlayer;
              if (!G.pendingConfront) return INVALID_MOVE;
              if (!G.modifyQueue.includes(pid)) return INVALID_MOVE;
              if (G.modifyDone.includes(pid)) return INVALID_MOVE;
              if (G.players[pid].isAutoma) return INVALID_MOVE;

              const slot = pendingSlot(G);
              const att = slot?.attachments[attIndex];
              if (!att || att.playerId !== pid) return INVALID_MOVE;
              if (!validateSetValue(G, pid, att, slot!, targetValue)) return INVALID_MOVE;

              const base = MILITARY_BY_ID[att.cardId];
              att.valueMod = targetValue - base.value;
              G.modifyDone.push(pid);
            },
          },

          swapWithHand: {
            client: false,
            move: ({ G, ctx }, attIndex: number, newCardId: string) => {
              const pid = ctx.currentPlayer;
              if (!G.pendingConfront) return INVALID_MOVE;
              if (!G.modifyQueue.includes(pid)) return INVALID_MOVE;
              if (G.modifyDone.includes(pid)) return INVALID_MOVE;
              if (G.players[pid].isAutoma) return INVALID_MOVE;

              const slot = pendingSlot(G);
              const att = slot?.attachments[attIndex];
              if (!att || att.playerId !== pid) return INVALID_MOVE;
              if (!validateSwap(G, pid, att, slot!, newCardId)) return INVALID_MOVE;

              const me = G.players[pid];
              me.hand = me.hand.filter((id) => id !== newCardId);
              me.hand.push(att.cardId);
              att.cardId = newCardId;
              att.valueMod = 0;
              att.typeOverride = null;
              att.revealed = true;
              G.modifyDone.push(pid);
            },
          },

          passModify: {
            client: false,
            move: ({ G, ctx }) => {
              const pid = ctx.currentPlayer;
              if (!G.pendingConfront) return INVALID_MOVE;
              if (!G.modifyQueue.includes(pid)) return INVALID_MOVE;
              if (G.modifyDone.includes(pid)) return INVALID_MOVE;
              G.modifyDone.push(pid);
            },
          },

          autoModify: {
            client: false,
            move: ({ G, ctx }) => {
              const pid = ctx.currentPlayer;
              if (!G.pendingConfront) return INVALID_MOVE;
              if (!G.players[pid].isAutoma) return INVALID_MOVE;
              if (!G.modifyQueue.includes(pid)) return INVALID_MOVE;
              if (G.modifyDone.includes(pid)) return INVALID_MOVE;

              const slot = pendingSlot(G);
              if (!slot) return INVALID_MOVE;
              const mine = slot.attachments.filter((a) => a.playerId === pid);
              const me = G.players[pid];

              let bestScore = scoreAttachments(mine);
              type BestAction =
                | { kind: 'modify'; att: Attachment; mod: Modification }
                | { kind: 'setValue'; att: Attachment; value: number }
                | { kind: 'swap'; att: Attachment; newCardId: string };
              let bestAction: BestAction | null = null;

              for (const att of mine) {
                for (const mode of ['plus', 'minus'] as const) {
                  if (!validateModify(G, pid, att, slot, mode)) continue;
                  const trial = mine.map((a) => ({ ...a }));
                  const t = trial[mine.indexOf(att)];
                  applyModification(t, { mode });
                  const s = scoreAttachments(trial);
                  if (compareScore(s, bestScore) > 0) {
                    bestScore = s;
                    bestAction = { kind: 'modify', att, mod: { mode } };
                  }
                }
                for (const nt of MILITARY_TYPES) {
                  if (!validateModify(G, pid, att, slot, 'type', nt)) continue;
                  const trial = mine.map((a) => ({ ...a }));
                  const t = trial[mine.indexOf(att)];
                  applyModification(t, { mode: 'type', newType: nt });
                  const s = scoreAttachments(trial);
                  if (compareScore(s, bestScore) > 0) {
                    bestScore = s;
                    bestAction = { kind: 'modify', att, mod: { mode: 'type', newType: nt } };
                  }
                }
                for (let v = MIN_VALUE; v <= MAX_VALUE; v++) {
                  if (!validateSetValue(G, pid, att, slot, v)) continue;
                  const trial = mine.map((a) => ({ ...a }));
                  const t = trial[mine.indexOf(att)];
                  t.valueMod = v - MILITARY_BY_ID[t.cardId].value;
                  const s = scoreAttachments(trial);
                  if (compareScore(s, bestScore) > 0) {
                    bestScore = s;
                    bestAction = { kind: 'setValue', att, value: v };
                  }
                }
                if (me.objectivesWon.includes('obj_10')) {
                  for (const newCardId of me.hand) {
                    if (!validateSwap(G, pid, att, slot, newCardId)) continue;
                    const trial = mine.map((a) => ({ ...a }));
                    const t = trial[mine.indexOf(att)];
                    t.cardId = newCardId;
                    t.valueMod = 0;
                    t.typeOverride = null;
                    const s = scoreAttachments(trial);
                    if (compareScore(s, bestScore) > 0) {
                      bestScore = s;
                      bestAction = { kind: 'swap', att, newCardId };
                    }
                  }
                }
              }

              if (bestAction) {
                if (bestAction.kind === 'modify') {
                  applyModification(bestAction.att, bestAction.mod);
                } else if (bestAction.kind === 'setValue') {
                  const base = MILITARY_BY_ID[bestAction.att.cardId];
                  bestAction.att.valueMod = bestAction.value - base.value;
                } else if (bestAction.kind === 'swap') {
                  me.hand = me.hand.filter((id) => id !== bestAction.newCardId);
                  me.hand.push(bestAction.att.cardId);
                  bestAction.att.cardId = bestAction.newCardId;
                  bestAction.att.valueMod = 0;
                  bestAction.att.typeOverride = null;
                }
              }
              G.modifyDone.push(pid);
            },
          },
        },

        endIf: ({ G }) => G.modifyDone.length >= G.modifyQueue.length,

        onEnd: ({ G, ctx }) => { resolveConfront(G, ctx.numPlayers); },
      },
    },

    endIf: ({ G }) => (G.gameOver ? { winner: G.winnerId ?? undefined } : undefined),

    playerView: ({ G, playerID }) => {
      const players: Record<string, PlayerState> = {};
      for (const [pid, p] of Object.entries(G.players)) {
        players[pid] = { ...p, hand: pid === playerID ? p.hand : [] };
      }
      const battlefield = G.battlefield.map((slot) => ({
        ...slot,
        attachments: slot.attachments.map((a) =>
          a.revealed || a.playerId === playerID ? a : { ...a, cardId: '' },
        ),
      }));
      return {
        ...G, players, battlefield,
        militaryDeck: G.militaryDeck.map(() => ''),
        objectiveDeck: G.objectiveDeck.map(() => ''),
      };
    },
  };
}