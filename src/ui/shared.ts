import { useSyncExternalStore } from 'react';

/** Nome exibido de um jogador (humano ou autômato). */
export function playerName(
  G: { players: Record<string, { isAutoma: boolean }> },
  pid: string,
): string {
  return G.players[pid]?.isAutoma ? `Autômato ${pid}` : `Jogador ${pid}`;
}

/* ------------------------------------------------------------------ */
/* Mini-store global (compartilhado entre todos os <Board>)            */
/* ------------------------------------------------------------------ */

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      if (next === value) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

/* "Trava" de interface: enquanto um modal está aberto, os autômatos
   (um <Board> por autômato no modo solo) esperam para jogar. */
const blockedStore = createStore(false);
export const setUiBlocked = blockedStore.set;
export function useUiBlocked(): boolean {
  return useSyncExternalStore(blockedStore.subscribe, blockedStore.get);
}

/* Zoom do Campo de Batalha: mantido entre turnos (hotseat troca de <Board>). */
export const BF_ZOOM_MIN = 0.8;
export const BF_ZOOM_MAX = 2;
export const BF_ZOOM_STEP = 0.2;

const zoomStore = createStore(1);
export function setBfZoom(value: number): void {
  const clamped = Math.min(BF_ZOOM_MAX, Math.max(BF_ZOOM_MIN, value));
  zoomStore.set(Math.round(clamped * 10) / 10);
}
export function useBfZoom(): number {
  return useSyncExternalStore(zoomStore.subscribe, zoomStore.get);
}
