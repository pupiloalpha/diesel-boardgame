// src/game/game.ts
import type { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type {
  Attachment,
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

const HAND_SIZE = 3;
const BATTLEFIELD_SIZE = 3;
const MARKET_SIZE = 3;
const OBJECTIVE_DECK_SIZE = 7;
const CARDS_TO_TRIGGER = 3;

type Rng = { Shuffle: <T>(deck: T[]) => T[]; Number: () => number };

type ModMode = 'plus' | 'minus' | 'type';
interface Modification {
  mode: ModMode;
  newType?: MilitaryType;
}

export function totalPlayers(o: GameOptions): number {
  return o.solo ? 1 + o.automas : o.numPlayers;
}

function shuffle<T>(arr: T[], random: Rng): T[] {
  return random.Shuffle([...arr]);
}

function setupPlayers(
  numPlayers: number,
  solo: boolean,
  random: Rng,
): Record<string, PlayerState> {
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

function pendingSlot(G: GameState) {
  return G.battlefield.find((s) => s.objectiveId === G.pendingConfront);
}

function eligibleModifiers(G: GameState): string[] {
  if (!G.options.asymmetric || !G.pendingConfront) return [];
  const slot = pendingSlot(G);
  if (!slot) return [];

  const n = Object.keys(G.players).length;
  const start = Number(G.confrontTriggeredBy) + 1;
  const result: string[] = [];

  for (let k = 0; k < n; k++) {
    const pid = String((start + k) % n);
    const bonus = FACTION_BY_ID[G.players[pid].factionId].bonusType;
    const has = slot.attachments.some(
      (a) => a.playerId === pid && MILITARY_BY_ID[a.cardId]?.type === bonus,
    );
    if (has) result.push(pid);
  }
  return result;
}

function applyModification(att: Attachment, mod: Modification): boolean {
  const base = MILITARY_BY_ID[att.cardId];
  if (!base) return false;
  const currentValue = base.value + att.valueMod;
  const currentType = att.typeOverride ?? base.type;

  if (mod.mode === 'plus') {
    if (currentValue + 1 > MAX_VALUE) return false;
    att.valueMod += 1;
    return true;
  }
  if (mod.mode === 'minus') {
    if (currentValue - 1 < MIN_VALUE) return false;
    att.valueMod -= 1;
    return true;
  }
  if (
    !mod.newType ||
    !MILITARY_TYPES.includes(mod.newType) ||
    mod.newType === currentType
  ) {
    return false;
  }
  att.typeOverride = mod.newType;
  return true;
}

function fixAutomaSlots(G: GameState, removedIdx: number) {
  for (const pid of Object.keys(G.automaSlot)) {
    const cur = G.automaSlot[pid];
    if (cur > removedIdx) {
      G.automaSlot[pid] = cur - 1;
    } else if (cur === removedIdx) {
      G.automaSlot[pid] = Math.min(
        removedIdx,
        Math.max(G.battlefield.length - 1, 0),
      );
    }
  }
}

/** Soma o PV de um jogador a partir dos IDs conquistados. */
function totalPV(G: GameState, pid: string): number {
  return G.players[pid].objectivesWon.reduce(
    (sum, objId) => sum + (OBJECTIVE_BY_ID[objId]?.pv ?? 0),
    0,
  );
}

function resolveConfront(G: GameState, numPlayers: number) {
  const triggerer = G.confrontTriggeredBy;
  const slotIdx = G.battlefield.findIndex(
    (s) => s.objectiveId === G.pendingConfront,
  );

  const clearConfrontState = () => {
    G.pendingConfront = null;
    G.confrontTriggeredBy = null;
    G.reinforcePassed = [];
    G.modifyQueue = [];
    G.modifyDone = [];
    G.hasAdvanced = false;
  };

  if (slotIdx < 0) {
    clearConfrontState();
    return;
  }

  const slot = G.battlefield[slotIdx];

  const byPlayer: Record<string, Attachment[]> = {};
  for (const att of slot.attachments) {
    (byPlayer[att.playerId] ??= []).push(att);
  }

  const participants = Object.keys(byPlayer).map((playerId) => {
    const s = scoreAttachments(byPlayer[playerId]);
    return {
      playerId,
      level: s.level,
      totalValue: s.totalValue,
      description: s.description,
    };
  });

  participants.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue;
    const da =
      (Number(a.playerId) - Number(G.firstPlayer) + numPlayers) % numPlayers;
    const db =
      (Number(b.playerId) - Number(G.firstPlayer) + numPlayers) % numPlayers;
    return db - da;
  });

  const winner = participants[0];
  if (winner) {
    G.players[winner.playerId].objectivesWon.push(slot.objectiveId);
  }

  G.militaryDiscard.push(...slot.attachments.map((a) => a.cardId));

  const objectiveId = slot.objectiveId;
  const nextObj = G.objectiveDeck.shift();
  if (nextObj) {
    G.battlefield[slotIdx] = { objectiveId: nextObj, attachments: [] };
  } else {
    G.battlefield.splice(slotIdx, 1);
    fixAutomaSlots(G, slotIdx);
  }

  // Fim de jogo: todos os objetivos foram conquistados.
  // Vencedor: MAIOR PV (não contagem).
  if (G.objectiveDeck.length === 0 && G.battlefield.length === 0) {
    G.gameOver = true;

    // Solo: o humano só vence conquistando TODOS os objetivos (contagem).
    if (
      G.options.solo &&
      G.players['0'].objectivesWon.length >= G.totalObjectives
    ) {
      G.winnerId = '0';
    } else {
      const ids = Object.keys(G.players);
      const pool = G.options.solo
        ? ids.filter((id) => G.players[id].isAutoma)
        : ids;
      G.winnerId = pool.reduce(
        (best, id) => (totalPV(G, id) > totalPV(G, best) ? id : best),
        pool[0],
      );
    }
  }

  const result: ConfrontResult = {
    objectiveId,
    winnerId: winner?.playerId ?? '',
    participants,
  };
  G.lastConfront = result;

  if (triggerer !== null) {
    G.resumeFrom = String((Number(triggerer) + 1) % numPlayers);
  }
  clearConfrontState();
}

export function createDiesel(options: GameOptions): Game<GameState> {
  return {
    name: 'diesel',

    setup: ({ ctx, random }): GameState => {
      const players = setupPlayers(ctx.numPlayers, options.solo, random);

      const militaryDeck = shuffle(
        MILITARY_CARDS.map((c) => c.id),
        random,
      );

      const objectiveCount = options.long
        ? OBJECTIVE_CARDS.length
        : OBJECTIVE_DECK_SIZE;

      const objectiveDeck = shuffle(
        OBJECTIVE_CARDS.map((c) => c.id),
        random,
      ).slice(0, objectiveCount);

      const battlefield = objectiveDeck
        .splice(0, BATTLEFIELD_SIZE)
        .map((objectiveId) => ({ objectiveId, attachments: [] }));

      const market = militaryDeck.splice(0, MARKET_SIZE);

      for (const pid of Object.keys(players)) {
        players[pid].hand = militaryDeck.splice(0, HAND_SIZE);
      }

      const automaSlot: Record<string, number> = {};
      for (const pid of Object.keys(players)) {
        if (players[pid].isAutoma) {
          automaSlot[pid] = Math.floor(random.Number() * BATTLEFIELD_SIZE);
        }
      }

      return {
        options,
        totalObjectives: objectiveCount,
        players,
        militaryDeck,
        militaryDiscard: [],
        market,
        objectiveDeck,
        battlefield,
        firstPlayer: '0',
        automaSlot,
        hasAdvanced: false,
        pendingConfront: null,
        confrontTriggeredBy: null,
        reinforcePassed: [],
        modifyQueue: [],
        modifyDone: [],
        resumeFrom: null,
        lastConfront: null,
        gameOver: false,
        winnerId: null,
      };
    },

    phases: {
      play: {
        start: true,
        next: 'reinforce',

        turn: {
          order: {
            first: ({ G }) =>
              G.resumeFrom !== null ? Number(G.resumeFrom) : 0,
            next: ({ ctx }) => (ctx.playOrderPos + 1) % ctx.numPlayers,
          },
          onBegin: ({ G }) => {
            G.hasAdvanced = false;
          },
        },

        moves: {
          advance: {
            client: false,
            move: ({ G, ctx }, cardId: string, objectiveId: string) => {
              const pid = ctx.currentPlayer;
              if (G.hasAdvanced || G.pendingConfront) return INVALID_MOVE;

              const me = G.players[pid];
              if (!me || me.isAutoma || !me.hand.includes(cardId)) {
                return INVALID_MOVE;
              }

              const slot = G.battlefield.find(
                (s) => s.objectiveId === objectiveId,
              );
              if (!slot) return INVALID_MOVE;

              const mine = slot.attachments.filter(
                (a) => a.playerId === pid,
              ).length;
              if (mine >= CARDS_TO_TRIGGER) return INVALID_MOVE;

              slot.attachments.push({
                playerId: pid,
                cardId,
                revealed: mine === 0,
                valueMod: 0,
                typeOverride: null,
              });
              me.hand = me.hand.filter((id) => id !== cardId);
              G.hasAdvanced = true;

              if (mine + 1 === CARDS_TO_TRIGGER) {
                G.pendingConfront = objectiveId;
                G.confrontTriggeredBy = pid;
                G.reinforcePassed = [];
              }
            },
          },

          recruit: {
            client: false,
            move: (
              { G, ctx, events, random },
              source: 'market' | 'deck',
              marketIndex?: number,
            ) => {
              if (!G.hasAdvanced) return INVALID_MOVE;
              const me = G.players[ctx.currentPlayer];
              if (!me || me.isAutoma || me.hand.length >= HAND_SIZE) {
                return INVALID_MOVE;
              }

              const nothingToDraw =
                G.market.length === 0 &&
                G.militaryDeck.length === 0 &&
                G.militaryDiscard.length === 0;

              if (!nothingToDraw) {
                if (source === 'market') {
                  if (
                    typeof marketIndex !== 'number' ||
                    marketIndex < 0 ||
                    marketIndex >= G.market.length
                  ) {
                    return INVALID_MOVE;
                  }
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

              if (G.pendingConfront) {
                events.setPhase('reinforce');
              } else {
                events.endTurn();
              }
            },
          },

          automaTurn: {
            client: false,
            move: ({ G, ctx, events, random }) => {
              const pid = ctx.currentPlayer;
              const me = G.players[pid];
              if (!me || !me.isAutoma || G.pendingConfront) {
                return INVALID_MOVE;
              }

              let card: string | undefined;
              if (G.market.length > 0) {
                const i = Math.floor(random.Number() * G.market.length);
                [card] = G.market.splice(i, 1);
                const next = drawFromDeck(G, random);
                if (next) G.market.push(next);
              } else {
                card = drawFromDeck(G, random);
              }

              if (!card) {
                events.endTurn();
                return;
              }

              const slot =
                G.battlefield[G.automaSlot[pid]] ?? G.battlefield[0];
              if (!slot) {
                events.endTurn();
                return;
              }

              slot.attachments.push({
                playerId: pid,
                cardId: card,
                revealed: true,
                valueMod: 0,
                typeOverride: null,
              });

              const mine = slot.attachments.filter(
                (a) => a.playerId === pid,
              ).length;

              if (mine >= CARDS_TO_TRIGGER) {
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
            first: ({ G, ctx }) =>
              (Number(G.confrontTriggeredBy) + 1) % ctx.numPlayers,
            next: ({ G, ctx }) => {
              let n = (ctx.playOrderPos + 1) % ctx.numPlayers;
              if (String(ctx.playOrder[n]) === G.confrontTriggeredBy) {
                n = (n + 1) % ctx.numPlayers;
              }
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
              if (!me || me.isAutoma || !me.hand.includes(cardId)) {
                return INVALID_MOVE;
              }

              const slot = pendingSlot(G);
              if (!slot) return INVALID_MOVE;

              slot.attachments.push({
                playerId: pid,
                cardId,
                revealed: false,
                valueMod: 0,
                typeOverride: null,
              });
              me.hand = me.hand.filter((id) => id !== cardId);

              while (me.hand.length < HAND_SIZE) {
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
        },

        endIf: ({ G, ctx }) => {
          if (G.reinforcePassed.length < ctx.numPlayers - 1) return false;
          return {
            next: eligibleModifiers(G).length > 0 ? 'modify' : 'play',
          };
        },

        onEnd: ({ G, ctx }) => {
          const queue = eligibleModifiers(G);
          if (queue.length > 0) {
            const slot = pendingSlot(G);
            slot?.attachments.forEach((a) => {
              a.revealed = true;
            });
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
            next: ({ G }) =>
              Number(G.modifyQueue[G.modifyDone.length] ?? G.modifyQueue[0]),
          },
          minMoves: 1,
          maxMoves: 1,
        },

        moves: {
          modifyCard: {
            client: false,
            move: (
              { G, ctx },
              attIndex: number,
              mode: ModMode,
              newType?: MilitaryType,
            ) => {
              const pid = ctx.currentPlayer;
              if (!G.pendingConfront) return INVALID_MOVE;
              if (!G.modifyQueue.includes(pid)) return INVALID_MOVE;
              if (G.modifyDone.includes(pid)) return INVALID_MOVE;
              if (G.players[pid].isAutoma) return INVALID_MOVE;

              const slot = pendingSlot(G);
              const att = slot?.attachments[attIndex];
              if (!att || att.playerId !== pid) return INVALID_MOVE;

              const bonus = FACTION_BY_ID[G.players[pid].factionId].bonusType;
              if (MILITARY_BY_ID[att.cardId]?.type !== bonus) {
                return INVALID_MOVE;
              }

              if (!applyModification(att, { mode, newType })) {
                return INVALID_MOVE;
              }
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

              const bonus = FACTION_BY_ID[G.players[pid].factionId].bonusType;
              const mine = slot.attachments.filter(
                (a) => a.playerId === pid,
              );

              const options: Modification[] = [
                { mode: 'plus' },
                { mode: 'minus' },
                ...MILITARY_TYPES.map(
                  (t): Modification => ({ mode: 'type', newType: t }),
                ),
              ];

              let bestScore = scoreAttachments(mine);
              let bestChoice: { att: Attachment; mod: Modification } | null =
                null;

              for (const att of mine) {
                if (MILITARY_BY_ID[att.cardId]?.type !== bonus) continue;
                for (const mod of options) {
                  const trial = mine.map((a) => ({ ...a }));
                  const trialAtt = trial[mine.indexOf(att)];
                  if (!applyModification(trialAtt, mod)) continue;
                  const s = scoreAttachments(trial);
                  if (compareScore(s, bestScore) > 0) {
                    bestScore = s;
                    bestChoice = { att, mod };
                  }
                }
              }

              if (bestChoice) applyModification(bestChoice.att, bestChoice.mod);
              G.modifyDone.push(pid);
            },
          },
        },

        endIf: ({ G }) => G.modifyDone.length >= G.modifyQueue.length,

        onEnd: ({ G, ctx }) => {
          resolveConfront(G, ctx.numPlayers);
        },
      },
    },

    endIf: ({ G }) => (G.gameOver ? { winner: G.winnerId } : undefined),

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
        ...G,
        players,
        battlefield,
        militaryDeck: G.militaryDeck.map(() => ''),
        // oculta a ordem dos próximos objetivos
        objectiveDeck: G.objectiveDeck.map(() => ''),
      };
    },
  };
}