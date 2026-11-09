import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { GameOptions, MilitaryType, AutomaDifficulty } from './game/types';
import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import {
  createDiesel,
  totalPlayers,
  validateModify,
  validateSetValue,
  validateSwap,
  conflictThreshold,
  isCardForbidden,
  totalPV,
  handSizeFor,
  isStuck,
} from './game/game';
import {
  MILITARY_BY_ID,
  OBJECTIVE_BY_ID,
  FACTION_BY_ID,
  CARD_BACKS,
} from './game/data';
import {
  MAX_VALUE,
  MIN_VALUE,
  MILITARY_TYPES,
  TYPE_LABEL,
} from './game/combos';
import SetupIntro from './ui/SetupIntro';
import ConfrontIntro from './ui/ConfrontIntro';
import VictoryModal from './ui/VictoryModal';
import SplashScreen from './ui/SplashScreen';
import DominioPanel from './ui/DominioPanel';
import SupremaciaModal from './ui/SupremaciaModal';
import ManualModal from './ui/ManualModal';
import {
  BF_ZOOM_MAX,
  BF_ZOOM_MIN,
  BF_ZOOM_STEP,
  playerName,
  setBfZoom,
  setUiBlocked,
  useBfZoom,
  useUiBlocked,
} from './ui/shared';
import { boxOf, flyCard } from './ui/flight';
import type { Box } from './ui/flight';
import { useIsMobile } from './ui/useIsMobile';
import './App.css';
import './ui/animations.css';
import './ui/table.css';
import './ui/dominio.css';
import './ui/manual.css';
import './ui/mobile.css';

const PHASE_LABEL: Record<string, string> = {
  play: 'Jogada',
  reinforce: 'Reforços',
  modify: 'Vantagem / Objetivo',
};

function Card({
  src, alt, className, onClick, dataId,
}: {
  src: string;
  alt: string;
  className?: string;
  onClick?: (e: MouseEvent<HTMLImageElement>) => void;
  dataId?: string;
}) {
  return (
    <img src={src} alt={alt} className={`card-img ${className ?? ''}`}
      data-card-id={dataId}
      onClick={onClick} draggable={false}
      style={onClick ? { cursor: 'pointer' } : undefined} />
  );
}

type BannerKind = 'phase' | 'result';
interface BannerData { id: number; title: string; subtitle?: string; kind: BannerKind }

function Banner({ data }: { data: BannerData | null }) {
  if (!data) return null;
  return (
    <div className="banner-overlay" key={data.id}>
      <div className={`banner banner-${data.kind}`}>
        <div className="banner-title">{data.title}</div>
        {data.subtitle && <div className="banner-subtitle">{data.subtitle}</div>}
      </div>
    </div>
  );
}

function StepIndicator({ G, ctx, supremacy }: any) {
  const inPlay = ctx.phase === 'play';
  const confront = !!G.pendingConfront;
  const inConfrontPhase = ctx.phase === 'reinforce' || ctx.phase === 'modify';
  const step3Active = confront || inConfrontPhase;
  const step1Active = inPlay && !G.hasAdvanced && !confront;
  const step2Active = inPlay && G.hasAdvanced && !confront;
  const step1Done = !step1Active && (G.hasAdvanced || step3Active);
  const step2Done = !step2Active && step3Active;
  return (
    <div className="steps">
      <div className={`step ${step1Active ? 'active' : step1Done ? 'done' : ''}`}>1 · Avanço</div>
      <div className={`step ${step2Active ? 'active' : step2Done ? 'done' : ''}`}>2 · Recrutamento</div>
      <div className={`step ${step3Active ? 'active' : ''}`}>3 · Confronto</div>
      <div className={`step ${supremacy ? 'active' : ''}`}>4 · Supremacia</div>
    </div>
  );
}

/**
 * Agrupa as cartas anexadas a um slot por jogador (ordem estável = ordem
 * numérica do playerId). Mantém a coerência do manual: uma facção por grupo.
 */
function groupAttachmentsByPlayer(slot: { attachments: any[] }) {
  const byPid = new Map<string, any[]>();
  for (const att of slot.attachments) {
    const list = byPid.get(att.playerId) ?? [];
    list.push(att);
    byPid.set(att.playerId, list);
  }
  return Array.from(byPid.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([pid, atts]) => ({ pid, atts }));
}

/**
 * Bloco visual reutilizado no desktop e no mobile: um grupo por jogador,
 * com miniatura de facção + tag (J0/A1) + cartas anexadas.
 */
function AttachmentsByPlayer({
  slot, players,
}: {
  slot: { attachments: any[] };
  players: Record<string, any>;
}) {
  const groups = groupAttachmentsByPlayer(slot);
  return (
    <>
      {groups.map(({ pid, atts }) => {
        const p = players[pid];
        const faction = p ? FACTION_BY_ID[p.factionId] : null;
        const tag = p?.isAutoma ? `A${pid}` : `J${pid}`;
        return (
          <div className="player-group" data-pid={pid} key={pid}>
            <div className="player-group-id">
              {faction && (
                <img
                  src={faction.image}
                  alt={faction.name}
                  className="player-group-faction"
                  draggable={false}
                />
              )}
              <span className="player-group-tag">{tag}</span>
            </div>
            <div className="player-group-cards">
              {atts.map((att, i) => {
                const hidden = !att.cardId;
                const base = hidden ? null : MILITARY_BY_ID[att.cardId];
                const src = base ? base.image : CARD_BACKS.military;
                const mods: string[] = [];
                if (base && att.valueMod) mods.push(att.valueMod > 0 ? '+1' : '−1');
                if (base && att.typeOverride) {
                  mods.push(`→${TYPE_LABEL[att.typeOverride as MilitaryType]?.slice(0, 3)}`);
                }
                return (
                  <div key={i} className="mini">
                    <img
                      src={src}
                      alt={hidden ? 'Carta oculta' : base?.name ?? 'Carta'}
                      className="card-mini"
                      draggable={false}
                    />
                    {mods.length > 0 && <span className="mini-mod">{mods.join(' ')}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ================================================================== */
/* Componentes dos modais mobile (recebem apenas o que precisam)      */
/* ================================================================== */

function MobileMarketModal({
  G, moves, canRecruit, onClose,
}: {
  G: any;
  moves: any;
  canRecruit: boolean;
  onClose: () => void;
}) {
  const nothingToDraw =
    G.market.length === 0 &&
    G.militaryDeck.length === 0 &&
    G.militaryDiscard.length === 0;

  return (
    <div className="mob-modal-overlay" onClick={onClose}>
      <div className="mob-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mob-modal-header">
          <h3>Mercado</h3>
          <button className="mob-close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        {canRecruit ? (
          <p className="mob-hint">
            Toque numa carta do Mercado para recrutá-la — ela é reposta imediatamente.
          </p>
        ) : (
          <p className="mob-hint">
            <strong>Prévia do Mercado.</strong> Você poderá recrutar uma carta
            após jogar uma carta da mão em um objetivo.
          </p>
        )}

        <div className="mob-market-grid">
          {G.market.map((id: string, i: number) => {
            const c = MILITARY_BY_ID[id];
            const onClick = canRecruit
              ? () => { moves.recruit('market', i); onClose(); }
              : undefined;
            return (
              <button
                key={`${id}-${i}`}
                type="button"
                className={`mob-market-card${canRecruit ? '' : ' readonly'}`}
                onClick={onClick}
                aria-label={canRecruit ? `Recrutar ${c.name}` : c.name}
              >
                <img src={c.image} alt={c.name} draggable={false} />
                <span className="mob-market-label">{c.name}</span>
              </button>
            );
          })}
        </div>

        {canRecruit ? (
          <>
            {nothingToDraw && (
              <p className="mob-hint" style={{ color: 'var(--amber)' }}>
                Não há mais cartas para comprar. Você pode pular o recrutamento.
              </p>
            )}
            <button
              className="mob-btn mob-btn-primary"
              onClick={() => { moves.recruit('deck'); onClose(); }}
            >
              {nothingToDraw ? 'Pular recrutamento' : 'Comprar do topo do deck'}
            </button>
          </>
        ) : (
          <button
            className="mob-btn mob-btn-ghost"
            style={{ marginTop: 8 }}
            onClick={onClose}
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  );
}

function MobileReinforceModal({
  G, moves, playerID, onClose,
}: {
  G: any;
  moves: any;
  playerID: string;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const me = G.players[playerID];
  const contested = G.pendingConfront ? OBJECTIVE_BY_ID[G.pendingConfront] : null;

  return (
    <div className="mob-modal-overlay" onClick={onClose}>
      <div className="mob-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mob-modal-header">
          <h3>Reforço</h3>
          <button className="mob-close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        {contested && (
          <p className="mob-hint">
            Confronto em: <strong>{contested.name}</strong>
          </p>
        )}
        <p className="mob-hint">Toque numa carta da mão para escolhê-la:</p>
        <div className="mob-hand-picker">
          {me.hand.map((id: string) => (
            <div
              key={id}
              className={`mob-pick-card ${picked === id ? 'picked' : ''}`}
              onClick={() => setPicked(picked === id ? null : id)}
            >
              <img src={MILITARY_BY_ID[id].image} alt={MILITARY_BY_ID[id].name} draggable={false} />
            </div>
          ))}
        </div>
        <button
          className="mob-btn mob-btn-primary"
          disabled={!picked}
          onClick={() => {
            if (picked) { moves.reinforceCard(picked); onClose(); }
          }}
        >
          {picked ? `Reforçar com ${MILITARY_BY_ID[picked].name}` : 'Escolha uma carta'}
        </button>
        <button
          className="mob-btn mob-btn-ghost"
          style={{ marginTop: 8 }}
          onClick={() => { moves.passReinforce(); onClose(); }}
        >
          Passar (não reforçar)
        </button>
      </div>
    </div>
  );
}

function MobileModifyModal({
  G, moves, playerID, slot, onClose,
}: {
  G: any;
  moves: any;
  playerID: string;
  slot: any;
  onClose: () => void;
}) {
  const me = G.players[playerID];
  const myAtts: { att: any; idx: number }[] = slot.attachments
    .map((att: any, idx: number) => ({ att, idx }))
    .filter(({ att }: any) => att.playerId === playerID);

  const allValues = Array.from(
    { length: MAX_VALUE - MIN_VALUE + 1 },
    (_, i) => MIN_VALUE + i,
  );

  return (
    <div className="mob-modal-overlay" onClick={onClose}>
      <div className="mob-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mob-modal-header">
          <h3>Modificações</h3>
          <button className="mob-close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        <p className="mob-hint">
          Escolha <strong>uma</strong> ação para uma das suas cartas:
        </p>

        {myAtts.map(({ att, idx }) => {
          const base = MILITARY_BY_ID[att.cardId];
          const curType: MilitaryType = att.typeOverride ?? base.type;
          const curValue = base.value + att.valueMod;

          const canPlus = validateModify(G, playerID, att, slot, 'plus');
          const canMinus = validateModify(G, playerID, att, slot, 'minus');
          const typeTargets = MILITARY_TYPES.filter(
            (t) => t !== curType && validateModify(G, playerID, att, slot, 'type', t),
          );
          const valueTargets = allValues.filter(
            (v) => v !== curValue && validateSetValue(G, playerID, att, slot, v),
          );
          const canSwap = me.hand.length > 0 && me.objectivesWon.includes('obj_10');
          const handOptions = canSwap
            ? me.hand.filter((id: string) => validateSwap(G, playerID, att, slot, id))
            : [];

          if (
            !canPlus && !canMinus &&
            typeTargets.length === 0 &&
            valueTargets.length === 0 &&
            handOptions.length === 0
          ) return null;

          return (
            <div className="mob-mod-card" key={idx}>
              <img src={base.image} alt={base.name} draggable={false} />
              <div className="mob-mod-options">
                {canPlus && (
                  <button onClick={() => { moves.modifyCard(idx, 'plus'); onClose(); }}>
                    +1
                  </button>
                )}
                {canMinus && (
                  <button onClick={() => { moves.modifyCard(idx, 'minus'); onClose(); }}>
                    −1
                  </button>
                )}
                {typeTargets.map((t) => (
                  <button
                    key={t}
                    onClick={() => { moves.modifyCard(idx, 'type', t); onClose(); }}
                  >
                    → {TYPE_LABEL[t]}
                  </button>
                ))}
                {valueTargets.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v) { moves.setCardValue(idx, v); onClose(); }
                    }}
                  >
                    <option value="">= Valor…</option>
                    {valueTargets.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                )}
                {handOptions.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) { moves.swapWithHand(idx, id); onClose(); }
                    }}
                  >
                    <option value="">↻ Trocar por…</option>
                    {handOptions.map((id: string) => (
                      <option key={id} value={id}>{MILITARY_BY_ID[id].name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}

        <button
          className="mob-btn mob-btn-ghost"
          style={{ marginTop: 8 }}
          onClick={() => { moves.passModify(); onClose(); }}
        >
          Não modificar
        </button>
      </div>
    </div>
  );
}

function MobilePlayersModal({
  G, playerID, onClose,
}: {
  G: any;
  playerID: string;
  onClose: () => void;
}) {
  const [inspectPid, setInspectPid] = useState(playerID);

  return (
    <div className="mob-modal-overlay" onClick={onClose}>
      <div className="mob-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mob-modal-header">
          <h3>Jogadores</h3>
          <button className="mob-close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        <ul className="mob-players-list">
          {Object.entries(G.players).map(([pid, p]: any) => {
            const f = FACTION_BY_ID[p.factionId];
            return (
              <li
                key={pid}
                className={pid === inspectPid ? 'active' : ''}
                onClick={() => setInspectPid(pid)}
              >
                <img src={f.image} alt={f.name} draggable={false} />
                <div className="info">
                  <strong>{playerName(G, pid)}{pid === playerID ? ' (você)' : ''}</strong>
                  <small>{f.name}</small>
                  <small>{totalPV(G, pid)} PV · {p.objectivesWon.length} objetivo(s)</small>
                </div>
              </li>
            );
          })}
        </ul>

        <DominioPanel G={G} pid={inspectPid} mine={inspectPid === playerID} />

        {G.lastConfront && (
          <div className="mob-confront-info">
            <strong>Último confronto:</strong> {playerName(G, G.lastConfront.winnerId)} venceu{' '}
            {OBJECTIVE_BY_ID[G.lastConfront.objectiveId]?.name}.
          </div>
        )}

        <button
          className="mob-btn mob-btn-primary"
          style={{ marginTop: 8 }}
          onClick={onClose}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabuleiro                                                           */
/* ------------------------------------------------------------------ */

function Board({ G, ctx, moves, playerID, onExit }: any) {
  const [selected, setSelected] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerData | null>(null);
  const bannerTimer = useRef<number | undefined>(undefined);
  const prevPhaseRef = useRef<string>(ctx.phase);
  const busyRef = useRef(false);
  const bfZoom = useBfZoom();

  /* --- Refs do PAN do campo de batalha --- */
  const bfScrollRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({
    active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false,
  });
  const [isPanning, setIsPanning] = useState(false);
  const suppressClickRef = useRef(false);

  /* --- Refs da animação de reposição do Mercado (autômatos) --- */
  const prevMarketRef = useRef<string[]>(G.market);
  const skipMarketAnimRef = useRef(false);

  const isMyTurn = ctx.currentPlayer === playerID;
  const iAmAutoma = !!G.players[playerID]?.isAutoma;
  const solo: boolean = G.options.solo;

  const isViewer = solo ? playerID === '0' : isMyTurn;

  /* --- Mobile --- */
  const isMobile = useIsMobile();
  const [mobileMarketOpen, setMobileMarketOpen] = useState(false);
  const [mobileReinforceOpen, setMobileReinforceOpen] = useState(false);
  const [mobileModifyOpen, setMobileModifyOpen] = useState(false);
  const [mobilePlayersOpen, setMobilePlayersOpen] = useState(false);

  const [introOpen, setIntroOpen] = useState(
    () => playerID === '0' && ctx.turn <= 1 && ctx.phase === 'play' && !G.gameOver,
  );
  const [confrontIntro, setConfrontIntro] = useState(false);
  const [supremacyOpen, setSupremacyOpen] = useState(false);
  const [endSeen, setEndSeen] = useState(false);
  const [inspectPid, setInspectPid] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const overlayOpen =
    introOpen || confrontIntro || supremacyOpen || manualOpen ||
    mobileMarketOpen || mobileReinforceOpen || mobileModifyOpen || mobilePlayersOpen;

  const uiBlocked = useUiBlocked();
  const automaActs = isMyTurn && iAmAutoma && !G.gameOver && !uiBlocked;

  const showBanner = (title: string, subtitle: string | undefined, kind: BannerKind) => {
    setBanner({ id: Date.now(), title, subtitle, kind });
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), 1800);
  };

  useEffect(() => { setSelected(null); setInspectPid(null); }, [ctx.currentPlayer]);

  useEffect(() => {
    if (!overlayOpen) return;
    setUiBlocked(true);
    return () => setUiBlocked(false);
  }, [overlayOpen]);

  /* Fecha modais mobile ao mudar de fase/jogador ou perder a ação */
  useEffect(() => {
    if (ctx.phase !== 'reinforce') setMobileReinforceOpen(false);
    if (ctx.phase !== 'modify') setMobileModifyOpen(false);
    if (!G.hasAdvanced) setMobileMarketOpen(false);
  }, [ctx.phase, G.hasAdvanced]);

  useEffect(() => {
    if (!automaActs) return;
    const t = setTimeout(() => {
      if (ctx.phase === 'play') moves.automaTurn();
      else if (ctx.phase === 'reinforce') moves.automaReinforce();
      else if (ctx.phase === 'modify') moves.autoModify();
    }, 700);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automaActs, ctx.phase, ctx.turn]);

  useEffect(() => {
    const prev = prevMarketRef.current;
    prevMarketRef.current = G.market;

    const same =
      prev.length === G.market.length &&
      prev.every((id, i) => id === G.market[i]);
    if (same) return;

    const skip = skipMarketAnimRef.current;
    if (skip) skipMarketAnimRef.current = false;
    if (skip) return;

    if (G.market.length < prev.length) return;
    if (!solo) return;
    if (!isViewer) return;
    if (isMobile) return; // mobile não usa animação de voo

    const deckImg = document.querySelector('[data-deck] img') as HTMLElement | null;
    const marketImgs = document.querySelectorAll('.market .card-img');
    if (!deckImg || marketImgs.length === 0) return;
    const last = marketImgs[marketImgs.length - 1];
    if (!last) return;

    flyCard({
      src: CARD_BACKS.military,
      from: boxOf(deckImg),
      to: boxOf(last),
      duration: 550,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [G.market, isViewer, solo, isMobile]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = ctx.phase;
    if (prev === ctx.phase) return;
    if (ctx.phase !== 'reinforce') setConfrontIntro(false);
    if (!isViewer) return;
    if (G.gameOver) return;
    if (ctx.phase === 'reinforce') setConfrontIntro(true);
    else if (ctx.phase === 'modify') showBanner('Modificações', 'Facção / Objetivo', 'phase');
    else if (ctx.phase === 'play' && (prev === 'reinforce' || prev === 'modify') && G.lastConfront) {
      setSupremacyOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.phase, isViewer]);

  useEffect(() => () => {
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
  }, []);

  /**
   * Retorna o elemento scrollável real do campo de batalha.
   *
   * Depois da migração do desktop para scroll de página, o `.bf-scroll`
   * cresce com o conteúdo e quem rola é o documento. Este helper prefere
   * o `.bf-scroll` (caso algum dia volte a ter scroll interno) e, senão,
   * sobe pela árvore até achar um ancestral scrollável; por fim, cai no
   * `document.scrollingElement` (a página inteira).
   */
  const getScrollable = (): HTMLElement | null => {
    const el = bfScrollRef.current;
    if (!el) return null;
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
      return el;
    }
    let parent = el.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      const scrollableY = style.overflowY === 'auto' || style.overflowY === 'scroll';
      const scrollableX = style.overflowX === 'auto' || style.overflowX === 'scroll';
      if (
        (scrollableY && parent.scrollHeight > parent.clientHeight + 1) ||
        (scrollableX && parent.scrollWidth > parent.clientWidth + 1)
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return (document.scrollingElement as HTMLElement | null) ?? null;
  };

  const onBfPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a')) return;
    const scrollable = getScrollable();
    if (!scrollable) return;
    panRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: scrollable.scrollLeft,
      scrollTop: scrollable.scrollTop,
      moved: false,
    };
  };

  const onBfPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = panRef.current;
    if (!st.active) return;
    const scrollable = getScrollable();
    if (!scrollable) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.moved) {
      if (Math.abs(dx) + Math.abs(dy) <= 4) return;
      st.moved = true;
      setIsPanning(true);
      const el = bfScrollRef.current;
      if (el) { try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
    }
    scrollable.scrollLeft = st.scrollLeft - dx;
    scrollable.scrollTop = st.scrollTop - dy;
  };

  const onBfPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = panRef.current;
    if (!st.active) return;
    const moved = st.moved;
    st.active = false;
    st.moved = false;
    if (moved) setIsPanning(false);
    const el = bfScrollRef.current;
    if (el) {
      try {
        if (el.hasPointerCapture?.(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch { /* ignore */ }
    }
    if (moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 50);
    }
  };

  if (G.gameOver) {
    if (playerID !== '0') return null;
    return endSeen
      ? <VictoryModal G={G} onExit={onExit} />
      : <SupremaciaModal G={G} onContinue={() => setEndSeen(true)} />;
  }
  if (!isViewer) return null;

  const me = G.players[playerID];
  if (!me) return null;

  const faction = FACTION_BY_ID[me.factionId];
  const asymmetric: boolean = G.options.asymmetric;
  const inspected: string = inspectPid && G.players[inspectPid] ? inspectPid : playerID;

  const isPlay = ctx.phase === 'play';
  const isReinforce = ctx.phase === 'reinforce';
  const isModify = ctx.phase === 'modify';
  const hasAdvanced: boolean = G.hasAdvanced;

  const canAdvance = isMyTurn && isPlay && !hasAdvanced;
  const canRecruit =
    isMyTurn && isPlay && hasAdvanced && me.hand.length < handSizeFor(G, playerID);
  const canReinforce =
    isMyTurn && isReinforce &&
    playerID !== G.confrontTriggeredBy &&
    !G.reinforcePassed.includes(playerID);
  const canModify =
    isMyTurn && isModify &&
    G.modifyQueue.includes(playerID) &&
    !G.modifyDone.includes(playerID);
  // Manual 2.0 — "ficar sem jogada": precisa comprar do deck até obter
  // uma carta jogável. Só relevante no início do turno (ainda sem Avanço).
  const stuckAtStart =
    isMyTurn && isPlay && !hasAdvanced && !G.pendingConfront &&
    !iAmAutoma && isStuck(G, playerID);

  const contested = G.pendingConfront ? OBJECTIVE_BY_ID[G.pendingConfront] : null;
  const confrontSlot = G.pendingConfront
    ? G.battlefield.find((s: any) => s.objectiveId === G.pendingConfront)
    : null;

  const myModifiable: { att: any; idx: number }[] =
    canModify && confrontSlot
      ? confrontSlot.attachments
          .map((att: any, idx: number) => ({ att, idx }))
          .filter(({ att }: any) => att.playerId === playerID)
      : [];

  const clearSelection = () => setSelected(null);

  const handTarget = (): Box | null => {
    const fan = document.querySelector('[data-hand-fan]');
    if (!fan) return null;
    const cards = fan.querySelectorAll('.card-img');
    const last = cards[cards.length - 1];
    if (last) {
      const b = boxOf(last);
      return { ...b, left: b.left + b.width * 0.6 };
    }
    const r = fan.getBoundingClientRect();
    return { left: r.left + r.width / 2 - 50, top: r.top, width: 100, height: 140 };
  };

  const slotTarget = (objectiveId: string): Box | null => {
    const area = document.querySelector(`[data-slot-id="${objectiveId}"] .attachments`);
    if (!area) return null;
    const mini = document.querySelector('.battlefield .card-mini');
    const w = mini instanceof HTMLElement && mini.offsetWidth ? mini.offsetWidth : 46 * bfZoom;
    const h = w * 1.4;

    // Mira a ÚLTIMA carta anexada (em qualquer grupo) — após o avanço,
    // a nova carta entra logo depois dela.
    const minis = area.querySelectorAll('.mini .card-mini');
    const lastMini = minis.length > 0 ? minis[minis.length - 1] : null;
    if (lastMini) {
      const b = boxOf(lastMini);
      return { left: b.left + w * 0.5, top: b.top, width: w, height: h };
    }

    const r = area.getBoundingClientRect();
    return { left: r.left + r.width / 2 - w / 2, top: r.top + 6, width: w, height: h };
  };

  const runFlight = async (opts: {
    fromEl: Element | null; src: string; to: Box | null; commit: () => void;
    swapTo?: string; refillFrom?: Element | null;
  }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const el = opts.fromEl instanceof HTMLElement ? opts.fromEl : null;
    try {
      if (el && opts.to) {
        const from = boxOf(el);
        el.style.visibility = 'hidden';
        const flights = [flyCard({ src: opts.src, from, to: opts.to, swapTo: opts.swapTo })];
        const refillTo = opts.refillFrom ? handTarget() : null;
        if (opts.refillFrom && refillTo) {
          flights.push(flyCard({
            src: CARD_BACKS.military,
            from: boxOf(opts.refillFrom),
            to: refillTo,
            delay: 250,
          }));
        }
        await Promise.all(flights);
      }
      opts.commit();
    } finally {
      busyRef.current = false;
      if (el) window.setTimeout(() => { el.style.visibility = ''; }, 350);
    }
  };

  const handleAdvance = (cardId: string, slot: any) => {
    const mine = slot.attachments.filter((a: any) => a.playerId === playerID).length;
    runFlight({
      fromEl: document.querySelector(`[data-card-id="${cardId}"]`),
      src: MILITARY_BY_ID[cardId].image,
      to: slotTarget(slot.objectiveId),
      swapTo: mine === 0 ? undefined : CARD_BACKS.military,
      commit: () => { moves.advance(cardId, slot.objectiveId); clearSelection(); },
    });
  };

  const handleRecruit = (source: 'market' | 'deck', index: number | undefined, fromEl: Element | null) => {
    if (source === 'market') {
      skipMarketAnimRef.current = true;
      window.setTimeout(() => { skipMarketAnimRef.current = false; }, 3000);
    }
    runFlight({
      fromEl,
      src: source === 'market' ? MILITARY_BY_ID[G.market[index!]].image : CARD_BACKS.military,
      to: handTarget(),
      commit: () => (source === 'market' ? moves.recruit('market', index) : moves.recruit('deck')),
    });
  };

  const handleReinforce = (cardId: string) => {
    const deckHasCards = G.militaryDeck.length + G.militaryDiscard.length > 0;
    runFlight({
      fromEl: document.querySelector(`[data-card-id="${cardId}"]`),
      src: MILITARY_BY_ID[cardId].image,
      to: G.pendingConfront ? slotTarget(G.pendingConfront) : null,
      swapTo: CARD_BACKS.military,
      refillFrom: deckHasCards ? document.querySelector('[data-deck] img') : null,
      commit: () => { moves.reinforceCard(cardId); clearSelection(); },
    });
  };

  let stepHint = '';
  if (canAdvance) stepHint = 'Avanço: clique em uma carta da mão e depois em um objetivo.';
  else if (canRecruit) stepHint = 'Recrutamento: compre uma carta do Mercado ou do deck.';
  else if (!isMyTurn && solo && !G.gameOver) stepHint = `Vez de ${playerName(G, ctx.currentPlayer)}…`;

  const activeRules = [
    solo ? `Solo (${Object.values(G.players).filter((p: any) => p.isAutoma).length} autômato(s))` : null,
    asymmetric ? 'Facções Assimétricas' : null,
    G.options.long ? 'Partida Longa' : null,
  ].filter(Boolean);

  const confrontKey = G.lastConfront
    ? `${G.lastConfront.objectiveId}-${G.lastConfront.winnerId}-${G.lastConfront.participants.length}`
    : 'none';

  const allValues = Array.from(
    { length: MAX_VALUE - MIN_VALUE + 1 },
    (_, i) => MIN_VALUE + i,
  );

  /* ================================================================ */
  /* MOBILE — render alternativo (mesma lógica, layout simplificado)  */
  /* ================================================================ */
  const renderMobile = () => {
    // Hint contextual no rodapé
    let actionHint: React.ReactNode = null;
    if (stuckAtStart) {
      actionHint = (
        <>Sem jogada válida. Use os botões abaixo para <strong>comprar do deck</strong>.</>
      );
    } else if (canAdvance) {
      if (selected) {
        const hasValidSlot = G.battlefield.some((slot: any) => {
          const myCount = slot.attachments.filter((a: any) => a.playerId === playerID).length;
          return !isCardForbidden(selected, slot.objectiveId)
            && myCount < conflictThreshold(slot.objectiveId);
        });
        actionHint = hasValidSlot
          ? <>Agora toque num <strong>objetivo</strong> para jogar a carta.</>
          : <>Esta carta não pode ir a nenhum objetivo. Escolha outra.</>;
      } else {
        actionHint = <>Toque numa <strong>carta da mão</strong> abaixo.</>;
      }
    } else if (canRecruit) {
      actionHint = <>Toque em <strong>Recrutar</strong> para comprar uma carta.</>;
    } else if (!isMyTurn && !G.gameOver) {
      actionHint = <>Vez de <strong>{playerName(G, ctx.currentPlayer)}</strong>…</>;
    }

    return (
      <div className="game game-mobile">
        <Banner data={banner} />

        {introOpen && <SetupIntro G={G} onDone={() => setIntroOpen(false)} />}
        {confrontIntro && G.pendingConfront && (
          <ConfrontIntro G={G} onContinue={() => setConfrontIntro(false)} />
        )}
        {supremacyOpen && G.lastConfront && (
          <SupremaciaModal
            G={G}
            nextPlayer={ctx.currentPlayer}
            onContinue={() => setSupremacyOpen(false)}
          />
        )}
        {manualOpen && <ManualModal onClose={() => setManualOpen(false)} />}

        {/* Topbar compacta */}
        <header className="mob-topbar">
          <button className="mob-icon-btn" onClick={onExit} aria-label="Voltar ao menu">
            ←
          </button>
          <div className="mob-brand">D.I.E.S.E.L.</div>
          <div className="mob-phase">
            {PHASE_LABEL[ctx.phase] ?? ctx.phase}
            {' · '}
            {playerName(G, ctx.currentPlayer)}
          </div>
          <button
            className="mob-icon-btn"
            onClick={() => setMobilePlayersOpen(true)}
            aria-label="Ver jogadores"
            title="Jogadores"
          >
            👥
          </button>
          <button
            className="mob-icon-btn"
            onClick={() => setManualOpen(true)}
            aria-label="Abrir manual"
            title="Manual"
          >
            ?
          </button>
        </header>

        {/* Campo de batalha (scrollável) */}
        <main className="mob-main">
          <div className="mob-battlefield">
            {G.battlefield.map((slot: any) => {
              const obj = OBJECTIVE_BY_ID[slot.objectiveId];
              const myCount = slot.attachments.filter((a: any) => a.playerId === playerID).length;
              const threshold = conflictThreshold(slot.objectiveId);
              const canDropHere =
                canAdvance && !!selected && myCount < threshold &&
                !isCardForbidden(selected, slot.objectiveId);

              return (
                <div key={slot.objectiveId} className="mob-slot" data-slot-id={slot.objectiveId}>
                  <div className="objective-name">{obj.name}</div>
                  <img
                    src={obj.image}
                    alt={obj.name}
                    className={`obj-img ${canDropHere ? 'highlight' : ''}`}
                    onClick={
                      canDropHere
                        ? () => {
                            moves.advance(selected!, slot.objectiveId);
                            setSelected(null);
                          }
                        : undefined
                    }
                    draggable={false}
                  />
                  <div className="attachments">
		     <AttachmentsByPlayer slot={slot} players={G.players} />
		     </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* Faixa compacta do Mercado — sempre visível (planejamento) */}
        <section className="mob-market-strip" aria-label="Mercado">
          <span className="mob-market-strip-label">Mercado</span>
          <div className="mob-market-strip-cards">
            {G.market.map((id: string, i: number) => {
              const c = MILITARY_BY_ID[id];
              return (
                <button
                  key={`mkt-${id}-${i}`}
                  type="button"
                  className="mob-market-thumb"
                  onClick={() => setMobileMarketOpen(true)}
                  aria-label={`Ver carta do mercado: ${c.name}`}
                  title={c.name}
                >
                  <img src={c.image} alt="" draggable={false} />
                  <span className="mob-market-tag">
                    {c.value}·{TYPE_LABEL[c.type].charAt(0)}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className="mob-market-thumb mob-market-deck"
              onClick={() => setMobileMarketOpen(true)}
              aria-label="Ver o baralho de cartas militares"
            >
              <img src={CARD_BACKS.military} alt="" draggable={false} />
              <span className="count">{G.militaryDeck.length}</span>
            </button>
          </div>
        </section>
                {/* Mão em leque (sempre visível) */}
        <section className="mob-hand">
          <div className="mob-hand-label">Minha mão ({me.hand.length})</div>
          {me.hand.length === 0 ? (
            <p className="mob-hint" style={{ margin: 0, textAlign: 'center' }}>
              Sem cartas na mão.
            </p>
          ) : (
            <div className="mob-hand-fan">
              {me.hand.map((id: string, i: number) => {
                const off = i - (me.hand.length - 1) / 2;
                const isSelected = selected === id;
                return (
                  <div
                    key={id}
                    className={`mob-hand-slot ${isSelected ? 'selected' : ''}`}
                    style={
                      {
                        '--mob-rot': `${off * 5}deg`,
                        '--mob-lift': `${Math.abs(off) * 6}px`,
                        zIndex: i + 1,
                      } as CSSProperties
                    }
                    onClick={
                      canAdvance
                        ? () => setSelected(isSelected ? null : id)
                        : undefined
                    }
                  >
                    <div className="mob-hand-card">
                      <img
                        src={MILITARY_BY_ID[id].image}
                        alt={MILITARY_BY_ID[id].name}
                        draggable={false}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Barra de ações contextual */}
        <div className="mob-action-bar">
          {actionHint && <div className="mob-action-hint">{actionHint}</div>}
          {stuckAtStart && (
            <div className="mob-action-row">
              <button
                className="mob-btn mob-btn-primary"
                onClick={() => moves.drawPlayable()}
              >
                Comprar carta jogável
              </button>
              <button
                className="mob-btn mob-btn-ghost"
                onClick={() => moves.skipAdvance()}
              >
                Pular
              </button>
            </div>
          )}
          {canRecruit && (
            <div className="mob-action-row">
              <button
                className="mob-btn mob-btn-primary"
                onClick={() => setMobileMarketOpen(true)}
              >
                Recrutar
              </button>
            </div>
          )}

          {canReinforce && (
            <div className="mob-action-row">
              <button
                className="mob-btn mob-btn-primary"
                onClick={() => setMobileReinforceOpen(true)}
              >
                Reforçar
              </button>
              <button
                className="mob-btn mob-btn-ghost"
                onClick={() => moves.passReinforce()}
              >
                Passar
              </button>
            </div>
          )}

          {canModify && (
            <div className="mob-action-row">
              <button
                className="mob-btn mob-btn-primary"
                onClick={() => setMobileModifyOpen(true)}
              >
                Modificar
              </button>
              <button
                className="mob-btn mob-btn-ghost"
                onClick={() => moves.passModify()}
              >
                Não modificar
              </button>
            </div>
          )}

          {!canAdvance && !canRecruit && !canReinforce && !canModify && !actionHint && (
            <div className="mob-action-hint">Aguardando…</div>
          )}
        </div>

        {/* Modais */}
        {mobileMarketOpen && (
  <MobileMarketModal
    G={G}
    moves={moves}
    canRecruit={canRecruit}
    onClose={() => setMobileMarketOpen(false)}
  />
)}
        {mobileReinforceOpen && (
          <MobileReinforceModal
            G={G}
            moves={moves}
            playerID={playerID}
            onClose={() => setMobileReinforceOpen(false)}
          />
        )}
        {mobileModifyOpen && confrontSlot && (
          <MobileModifyModal
            G={G}
            moves={moves}
            playerID={playerID}
            slot={confrontSlot}
            onClose={() => setMobileModifyOpen(false)}
          />
        )}
        {mobilePlayersOpen && (
          <MobilePlayersModal
            G={G}
            playerID={playerID}
            onClose={() => setMobilePlayersOpen(false)}
          />
        )}
      </div>
    );
  };

  if (isMobile) return renderMobile();

  /* ================================================================ */
  /* DESKTOP / TABLET — render original, intocado                     */
  /* ================================================================ */
  return (
    <div className="game">
      <Banner data={banner} />

      {introOpen && <SetupIntro G={G} onDone={() => setIntroOpen(false)} />}
      {confrontIntro && G.pendingConfront && (
        <ConfrontIntro G={G} onContinue={() => setConfrontIntro(false)} />
      )}
      {supremacyOpen && G.lastConfront && (
        <SupremaciaModal
          G={G}
          nextPlayer={ctx.currentPlayer}
          onContinue={() => setSupremacyOpen(false)}
        />
      )}
      {manualOpen && <ManualModal onClose={() => setManualOpen(false)} />}

      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">D.I.E.S.E.L.</div>
          <div className="topbar-info">
            <div><strong>Fase:</strong> {PHASE_LABEL[ctx.phase] ?? ctx.phase}</div>
            <div><strong>Turno:</strong> {playerName(G, ctx.currentPlayer)}</div>
            <div><strong>Objetivos:</strong> {G.objectiveDeck.length + G.battlefield.length}</div>
            <div className="me">
              <img src={faction.image} alt={faction.name} className="faction-thumb" />
              <span>Jogador <strong>{playerID}</strong> · {faction.name}</span>
            </div>
            {activeRules.length > 0 && <div className="rules-tag">{activeRules.join(' · ')}</div>}
          </div>
          <div className="topbar-actions">
            <button onClick={() => setManualOpen(true)}>Manual</button>
            <button onClick={onExit}>Voltar ao Menu</button>
          </div>
        </div>
        <StepIndicator G={G} ctx={ctx} supremacy={supremacyOpen} />
      </header>

      <main className="layout">
        <aside className="col-left">
          <section>
            <h3>Mercado</h3>
            {isMyTurn && isPlay && !hasAdvanced && (
              <p className="hint">Jogue uma carta em um objetivo antes de recrutar.</p>
            )}
          {stuckAtStart && (
            <section className="stuck-warning">
              <p className="hint" style={{ margin: 0 }}>
                <strong>Sem jogada válida.</strong>{' '}
                Compre do topo do deck até obter uma carta jogável (as não
                jogáveis serão descartadas).
              </p>
              <button
                onClick={() => moves.drawPlayable()}
                style={{ marginTop: 8 }}
              >
                Comprar carta jogável
              </button>
              <button
                onClick={() => moves.skipAdvance()}
                style={{ marginTop: 6 }}
              >
                Pular Avanço (sem cartas no deck)
              </button>
            </section>
          )}
            <div className="market">
              {G.market.map((id: string, i: number) => {
                const c = MILITARY_BY_ID[id];
                return <Card key={id} src={c.image} alt={c.name}
                  onClick={canRecruit ? (e) => handleRecruit('market', i, e.currentTarget) : undefined} />;
              })}
              <div className="deck-button" data-deck
                onClick={canRecruit ? (e) => handleRecruit('deck', undefined, e.currentTarget.querySelector('img')) : undefined}
                style={{ opacity: canRecruit ? 1 : 0.5 }}>
                <img src={CARD_BACKS.military} alt="Deck militar" className="card-img" draggable={false} />
                <span>Deck</span>
              </div>
            </div>
          </section>

          {isReinforce && (
            <section className="reinforce-actions">
              <h3>Reforço</h3>
              {contested && <p className="hint">Confronto em: <strong>{contested.name}</strong></p>}
              {canReinforce ? (
                <>
                  <p className="hint">Escolha uma carta na mão, então:</p>
                  <button disabled={!selected} onClick={() => { if (selected) handleReinforce(selected); }}>
                    Reforçar com {selected ? MILITARY_BY_ID[selected].name : '…'}
                  </button>
                  <button onClick={() => { moves.passReinforce(); clearSelection(); }}>Passar</button>
                </>
              ) : <p className="hint">Aguardando os demais jogadores…</p>}
            </section>
          )}
        </aside>

        <section className="col-center">
          <section className="bf-section">
            <h3>Campo de Batalha</h3>
            <div className="bf-toolbar">
              <span>Zoom</span>
              <button aria-label="Reduzir zoom" disabled={bfZoom <= BF_ZOOM_MIN}
                onClick={() => setBfZoom(bfZoom - BF_ZOOM_STEP)}>−</button>
              <button aria-label="Restaurar zoom" onClick={() => setBfZoom(1)}>
                {Math.round(bfZoom * 100)}%
              </button>
              <button aria-label="Aumentar zoom" disabled={bfZoom >= BF_ZOOM_MAX}
                onClick={() => setBfZoom(bfZoom + BF_ZOOM_STEP)}>+</button>
            </div>
            <div
              className={`bf-scroll ${isPanning ? 'panning' : ''}`}
              ref={bfScrollRef}
              onPointerDown={onBfPointerDown}
              onPointerMove={onBfPointerMove}
              onPointerUp={onBfPointerUp}
              onPointerCancel={onBfPointerUp}
            >
              <div className="battlefield" style={{ '--bf-zoom': bfZoom } as CSSProperties}>
                {G.battlefield.map((slot: any) => {
                  const obj = OBJECTIVE_BY_ID[slot.objectiveId];
                  const myCount = slot.attachments.filter((a: any) => a.playerId === playerID).length;
                  const threshold = conflictThreshold(slot.objectiveId);
                  const canDropHere = canAdvance && !!selected && myCount < threshold
                    && !isCardForbidden(selected, slot.objectiveId);
                  return (
                    <div key={slot.objectiveId} className="slot" data-slot-id={slot.objectiveId}>
                      <div className="objective-name">{obj.name}</div>
                      {obj.text && <div className="hint" style={{ marginBottom: 0, textAlign: 'center' }}>{obj.text}</div>}
                      {threshold !== 3 && (
                        <div className="badge" style={{ fontSize: '0.6rem' }}>Conflito: {threshold} cartas</div>
                      )}
                      <Card src={obj.image} alt={obj.name}
                        className={canDropHere ? 'highlight' : ''}
                        onClick={canDropHere ? () => {
                          if (suppressClickRef.current) return;
                          handleAdvance(selected!, slot);
                        } : undefined} />
		    <div className="attachments">
			  <AttachmentsByPlayer slot={slot} players={G.players} />
		    </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {isModify && (
            <section className="reinforce-actions">
              <h3>Modificações</h3>
              {contested && (
                <p className="hint">
                  Confronto em: <strong>{contested.name}</strong> — cartas reveladas.
                </p>
              )}
              {canModify ? (
                <>
                  <p className="hint">
                    Escolha <strong>uma</strong> ação (facção, objetivo ou habilidade conquistada):
                  </p>
                  {myModifiable.map(({ att, idx }) => {
                    const base = MILITARY_BY_ID[att.cardId];
                    const curType: MilitaryType = att.typeOverride ?? base.type;
                    const curValue = base.value + att.valueMod;

                    const canPlus = validateModify(G, playerID, att, confrontSlot!, 'plus');
                    const canMinus = validateModify(G, playerID, att, confrontSlot!, 'minus');
                    const typeTargets = MILITARY_TYPES.filter(
                      (t) => t !== curType && validateModify(G, playerID, att, confrontSlot!, 'type', t),
                    );
                    const valueTargets = allValues.filter(
                      (v) => v !== curValue && validateSetValue(G, playerID, att, confrontSlot!, v),
                    );
                    const canSwap = me.hand.length > 0
                      && G.players[playerID].objectivesWon.includes('obj_10');
                    const handOptions = canSwap
                      ? me.hand.filter((id: string) => validateSwap(G, playerID, att, confrontSlot!, id))
                      : [];
                    if (!canPlus && !canMinus && typeTargets.length === 0 && valueTargets.length === 0 && handOptions.length === 0) {
                      return null;
                    }
                    return (
                      <div className="mod-row" key={idx}>
                        <img src={base.image} alt={base.name} className="card-mini" draggable={false} />
                        <div className="mod-buttons">
                          {canPlus && <button onClick={() => moves.modifyCard(idx, 'plus')}>+1</button>}
                          {canMinus && <button onClick={() => moves.modifyCard(idx, 'minus')}>−1</button>}
                          {typeTargets.map((t) => (
                            <button key={t} onClick={() => moves.modifyCard(idx, 'type', t)}>
                              → {TYPE_LABEL[t]}
                            </button>
                          ))}
                          {valueTargets.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (v) moves.setCardValue(idx, v);
                              }}
                              style={{ gridColumn: '1 / -1', marginTop: 2 }}
                            >
                              <option value="">= Valor…</option>
                              {valueTargets.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          )}
                          {handOptions.length > 0 && (
                            <select
                              value=""
                              onChange={(e) => {
                                const id = e.target.value;
                                if (id) moves.swapWithHand(idx, id);
                              }}
                              style={{ gridColumn: '1 / -1', marginTop: 2 }}
                            >
                              <option value="">↻ Trocar por…</option>
                              {handOptions.map((id: string) => (
                                <option key={id} value={id}>{MILITARY_BY_ID[id].name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={() => moves.passModify()}>Não modificar</button>
                </>
              ) : <p className="hint">Aguardando os demais jogadores…</p>}
            </section>
          )}
        </section>

        <aside className="col-right">
          <section>
            <h3>Jogadores</h3>
            <ul className="players">
              {Object.entries(G.players).map(([pid, p]: any) => {
                const f = FACTION_BY_ID[p.factionId];
                const inspect = () => setInspectPid(pid === playerID ? null : pid);
                return (
                  <li key={pid}
                    className={[
                      pid === ctx.currentPlayer ? 'current' : '',
                      'inspectable',
                      pid === inspected ? 'inspected' : '',
                    ].join(' ')}
                    role="button" tabIndex={0}
                    aria-pressed={pid === inspected}
                    title="Ver o Domínio deste jogador"
                    onClick={inspect}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(); }
                    }}>
                    <img src={f.image} alt={f.name} className="player-faction-card" />
                    <div>
                      <div>
                        <strong>{playerName(G, pid)}</strong>
                        {pid === playerID && solo ? ' (você)' : ''}
                      </div>
                      <div className="player-faction-name">{f.name}</div>
                      <div>{totalPV(G, pid)} PV · {p.objectivesWon.length} objetivo(s)</div>
                      {p.objectivesWon.length > 0 && (
                        <div className="dm-chips">
                          {p.objectivesWon.map((id: string, i: number) => (
                            <img key={`${id}-${i}`} src={OBJECTIVE_BY_ID[id].image}
                              alt={OBJECTIVE_BY_ID[id].name} title={OBJECTIVE_BY_ID[id].name}
                              draggable={false} />
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <DominioPanel G={G} pid={inspected} mine={inspected === playerID} />

          {G.lastConfront && (
            <section key={confrontKey} className="confront-result">
              <h3>Último confronto</h3>
              <p><strong>Vencedor:</strong> {playerName(G, G.lastConfront.winnerId)}</p>
              <ul>
                {G.lastConfront.participants.map((p: any) => (
                  <li key={p.playerId} className={p.playerId === G.lastConfront.winnerId ? 'winner' : ''}>
                    {playerName(G, p.playerId)} — Nível {p.level} ({p.description}) / soma {p.totalValue}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </main>

      <div className="hand-dock">
        <div className="hand-label">
          <span>Minha mão</span>
          {stepHint && <span className="hand-hint">{stepHint}</span>}
        </div>
        <div className="hand-fan" data-hand-fan>
          {me.hand.length === 0 && <p className="hand-empty">Sem cartas na mão.</p>}
          {me.hand.map((id: string, i: number) => {
            const c = MILITARY_BY_ID[id];
            const off = i - (me.hand.length - 1) / 2;
            const isSelected = selected === id;
            const clickable = canAdvance || canReinforce;
            return (
              <div key={id} className="hand-slot"
                style={{ '--rot': `${off * 7}deg`, '--lift': `${Math.abs(off) * 8}px` } as CSSProperties}>
                <Card src={c.image} alt={c.name} dataId={id}
                  className={isSelected ? 'selected' : ''}
                  onClick={clickable ? () => setSelected(isSelected ? null : id) : undefined} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby                                                               */
/* ------------------------------------------------------------------ */

type GameMode = 'hotseat' | 'solo' | 'coop';

function Lobby({ onStart, reveal }: { onStart: (o: GameOptions) => void; reveal: boolean }) {
  const [mode, setMode] = useState<GameMode>('hotseat');
  const [numPlayers, setNumPlayers] = useState(4);
  const [automas, setAutomas] = useState(1);
  const [difficulty, setDifficulty] = useState<AutomaDifficulty>('medium');
  const [long, setLong] = useState(false);
  const [asymmetric, setAsymmetric] = useState(false);

  const start = () => {
    if (mode === 'hotseat') {
      onStart({ numPlayers, long, asymmetric, solo: false, automas: 0 });
      return;
    }
    onStart({
      numPlayers: 1 + automas,
      long,
      asymmetric,
      solo: true,
      automas,
      difficulty,
      // Regra de vitória especial apenas no modo solo clássico.
      soloOnly: mode === 'solo',
    });
  };

  return (
    <div className={`lobby ${reveal ? 'lobby-reveal' : 'lobby-wait'}`}>
      <h1>D.I.E.S.E.L.</h1>
      <p className="hint">Distopia · Indústria · Estratégia · Supremacia · Energia · Leviatãs</p>

      <h3>Modo de jogo</h3>
      <label>
        <input
          type="radio"
          checked={mode === 'hotseat'}
          onChange={() => setMode('hotseat')}
        />{' '}
        Multijogador (hotseat)
      </label>
      <label>
        <input
          type="radio"
          checked={mode === 'solo'}
          onChange={() => setMode('solo')}
        />{' '}
        Solo — você só vence conquistando todos os objetivos
      </label>
      <label>
        <input
          type="radio"
          checked={mode === 'coop'}
          onChange={() => setMode('coop')}
        />{' '}
        Competitivo vs. Autômatos — vence quem tiver mais PV
      </label>

      {mode === 'hotseat' ? (
        <>
          <h3>Jogadores</h3>
          <select value={numPlayers} onChange={(e) => setNumPlayers(Number(e.target.value))}>
            <option value={2}>2 jogadores</option>
            <option value={3}>3 jogadores</option>
            <option value={4}>4 jogadores</option>
          </select>
        </>
      ) : (
        <>
          <h3>Autômatos em jogo</h3>
          <select value={automas} onChange={(e) => setAutomas(Number(e.target.value))}>
            <option value={1}>1 autômato</option>
            <option value={2}>2 autômatos</option>
            <option value={3}>3 autômatos</option>
          </select>
          <h3>Inteligência do autômato</h3>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as AutomaDifficulty)}
          >
            <option value="easy">Básico — sorteia cartas do Mercado</option>
            <option value="medium">Otimizado — busca a melhor combinação</option>
            <option value="hard">Estratégico — também reforça em confrontos</option>
          </select>
          <p className="hint">
            {mode === 'solo'
              ? 'No modo solo você só vence se conquistar TODOS os objetivos.'
              : 'No competitivo vs. autômatos vale a regra padrão: vence quem tiver mais PV.'}
          </p>
        </>
      )}

      <h3>Regras opcionais</h3>
      <label><input type="checkbox" checked={long} onChange={(e) => setLong(e.target.checked)} /> Partida longa (usa os 12 objetivos)</label>
      <label><input type="checkbox" checked={asymmetric} onChange={(e) => setAsymmetric(e.target.checked)} /> Facções assimétricas</label>

      <button onClick={start}>Iniciar partida</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Raiz                                                                */
/* ------------------------------------------------------------------ */

function GameRoot({ options, onExit }: { options: GameOptions; onExit: () => void }) {
  const total = totalPlayers(options);
  const DieselClient = useMemo(() => {
    const BoardWithExit = (props: any) => <Board {...props} onExit={onExit} />;
    return Client({
      game: createDiesel(options),
      numPlayers: total,
      board: BoardWithExit,
      multiplayer: Local(),
      debug: false,
    });
  }, [options, total, onExit]);

  useEffect(() => () => setUiBlocked(false), []);

  return (
    <>
      {Array.from({ length: total }, (_, i) => (
        <DieselClient key={i} playerID={String(i)} matchID="hotseat" />
      ))}
    </>
  );
}

export default function App() {
  const [options, setOptions] = useState<GameOptions | null>(null);
  const handleExit = useCallback(() => setOptions(null), []);
  const [splash, setSplash] = useState<'show' | 'leaving' | 'done'>('show');

  if (options) return <GameRoot options={options} onExit={handleExit} />;

  return (
    <>
      <Lobby onStart={setOptions} reveal={splash !== 'show'} />
      {splash !== 'done' && (
        <SplashScreen
          onLeaving={() => setSplash((s) => (s === 'show' ? 'leaving' : s))}
          onDone={() => setSplash('done')}
        />
      )}
    </>
  );
}
