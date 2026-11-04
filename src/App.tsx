import { useEffect, useMemo, useRef, useState } from 'react';
import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { createDiesel, totalPlayers } from './game/game';
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
import type { GameOptions, MilitaryType } from './game/types';
import './App.css';

const HAND_SIZE = 3;

const PHASE_LABEL: Record<string, string> = {
  play: 'Jogada',
  reinforce: 'Reforços',
  modify: 'Vantagem de facção',
};

/* ------------------------------------------------------------------ */
/* Componentes                                                         */
/* ------------------------------------------------------------------ */

function Card({
  src,
  alt,
  className,
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={`card-img ${className ?? ''}`}
      onClick={onClick}
      draggable={false}
      style={onClick ? { cursor: 'pointer' } : undefined}
    />
  );
}

function playerName(G: any, pid: string) {
  return G.players[pid]?.isAutoma ? `Autômato ${pid}` : `Jogador ${pid}`;
}

type BannerKind = 'phase' | 'result';
interface BannerData {
  id: number;
  title: string;
  subtitle?: string;
  kind: BannerKind;
}

function Banner({ data }: { data: BannerData | null }) {
  if (!data) return null;
  return (
    <div className="banner-overlay" key={data.id}>
      <div className={`banner banner-${data.kind}`}>
        <div className="banner-title">{data.title}</div>
        {data.subtitle && (
          <div className="banner-subtitle">{data.subtitle}</div>
        )}
      </div>
    </div>
  );
}

function GameOver({ G }: any) {
  const solo: boolean = G.options.solo;
  const won = G.winnerId === '0';

  const ranking = Object.entries(G.players)
    .map(([pid, p]: any) => ({ pid, wins: p.objectivesWon.length }))
    .sort((a, b) => b.wins - a.wins);

  return (
    <div className="game-over">
      <h1>D.I.E.S.E.L — Fim de Jogo</h1>
      {solo ? (
        won ? (
          <h2>Vitória! Você conquistou todos os objetivos.</h2>
        ) : (
          <h2>Derrota. Os autômatos conquistaram objetivos.</h2>
        )
      ) : (
        <h2>Vencedor: {playerName(G, G.winnerId)}</h2>
      )}
      <ul>
        {ranking.map((r) => (
          <li key={r.pid}>
            {playerName(G, r.pid)} — {r.wins} objetivo(s)
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Indicador visual dos 3 passos do turno.
 * Mostra o progresso do JOGADOR ATUAL (não necessariamente o viewer),
 * o que faz sentido em solo quando o humano acompanha o autômata.
 */
function StepIndicator({ G, ctx }: any) {
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
      <div
        className={`step ${step1Active ? 'active' : step1Done ? 'done' : ''}`}
      >
        1 · Avanço
      </div>
      <div
        className={`step ${step2Active ? 'active' : step2Done ? 'done' : ''}`}
      >
        2 · Recrutamento
      </div>
      <div className={`step ${step3Active ? 'active' : ''}`}>
        3 · Confronto
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabuleiro                                                           */
/* ------------------------------------------------------------------ */

function Board({ G, ctx, moves, playerID }: any) {
  const [selected, setSelected] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerData | null>(null);
  const bannerTimer = useRef<number | undefined>(undefined);
  const prevPhaseRef = useRef<string>(ctx.phase);

  const isMyTurn = ctx.currentPlayer === playerID;
  const iAmAutoma = !!G.players[playerID]?.isAutoma;
  const automaActs = isMyTurn && iAmAutoma && !G.gameOver;
  const solo: boolean = G.options.solo;
  const shouldShowBanners = solo || isMyTurn;

  const showBanner = (
    title: string,
    subtitle: string | undefined,
    kind: BannerKind,
  ) => {
    setBanner({ id: Date.now(), title, subtitle, kind });
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), 1800);
  };

  // Reseta a seleção ao trocar de jogador ativo
  useEffect(() => {
    setSelected(null);
  }, [ctx.currentPlayer]);

  // Automa joga sozinho
  useEffect(() => {
    if (!automaActs) return;
    const t = setTimeout(() => {
      if (ctx.phase === 'play') moves.automaTurn();
      else if (ctx.phase === 'reinforce') moves.passReinforce();
      else if (ctx.phase === 'modify') moves.autoModify();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automaActs, ctx.phase, ctx.turn]);

  // Detecta mudança de fase → banner
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = ctx.phase;
    if (prev === ctx.phase) return;
    if (!shouldShowBanners) return;
    if (G.gameOver) return;

    if (ctx.phase === 'reinforce') {
      showBanner('Confronto!', 'Fase de Reforços', 'phase');
    } else if (ctx.phase === 'modify') {
      showBanner('Vantagem de Facção', 'Modificação de cartas', 'phase');
    } else if (
      ctx.phase === 'play' &&
      (prev === 'reinforce' || prev === 'modify') &&
      G.lastConfront
    ) {
      const obj = OBJECTIVE_BY_ID[G.lastConfront.objectiveId];
      showBanner(
        `${playerName(G, G.lastConfront.winnerId)} venceu`,
        obj?.name ?? 'Confronto resolvido',
        'result',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.phase, shouldShowBanners]);

  // Cleanup do timer
  useEffect(
    () => () => {
      if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    },
    [],
  );

  if (G.gameOver) {
    return (
      <>
        <Banner data={banner} />
        {playerID === '0' ? <GameOver G={G} /> : null}
      </>
    );
  }

  // Solo: só o jogador 0 renderiza. Hotseat: só o ativo renderiza.
  if (solo ? playerID !== '0' : !isMyTurn) {
    return solo ? <Banner data={banner} /> : null;
  }

  const me = G.players[playerID];
  if (!me) return null;

  const faction = FACTION_BY_ID[me.factionId];
  const asymmetric: boolean = G.options.asymmetric;

  const isPlay = ctx.phase === 'play';
  const isReinforce = ctx.phase === 'reinforce';
  const isModify = ctx.phase === 'modify';
  const hasAdvanced: boolean = G.hasAdvanced;

  const canAdvance = isMyTurn && isPlay && !hasAdvanced;
  const canRecruit =
    isMyTurn && isPlay && hasAdvanced && me.hand.length < HAND_SIZE;
  const canReinforce =
    isMyTurn &&
    isReinforce &&
    playerID !== G.confrontTriggeredBy &&
    !G.reinforcePassed.includes(playerID);
  const canModify =
    isMyTurn &&
    isModify &&
    G.modifyQueue.includes(playerID) &&
    !G.modifyDone.includes(playerID);

  const contested = G.pendingConfront
    ? OBJECTIVE_BY_ID[G.pendingConfront]
    : null;
  const confrontSlot = G.pendingConfront
    ? G.battlefield.find((s: any) => s.objectiveId === G.pendingConfront)
    : null;

  const myModifiable: { att: any; idx: number }[] =
    canModify && confrontSlot
      ? confrontSlot.attachments
          .map((att: any, idx: number) => ({ att, idx }))
          .filter(
            ({ att }: any) =>
              att.playerId === playerID &&
              att.cardId &&
              MILITARY_BY_ID[att.cardId].type === faction.bonusType,
          )
      : [];

  const clearSelection = () => setSelected(null);

  let stepHint = '';
  if (canAdvance) {
    stepHint =
      'Avanço: clique em uma carta da mão e depois em um objetivo.';
  } else if (canRecruit) {
    stepHint = 'Recrutamento: compre uma carta do Mercado ou do deck.';
  } else if (!isMyTurn && solo && !G.gameOver) {
    stepHint = `Vez de ${playerName(G, ctx.currentPlayer)}…`;
  }

  const activeRules = [
    solo
      ? `Solo (${Object.values(G.players).filter((p: any) => p.isAutoma).length} autômato(s))`
      : null,
    asymmetric ? 'Facções Assimétricas' : null,
    G.options.long ? 'Partida Longa' : null,
  ].filter(Boolean);

  // Chave para reanimar o painel a cada novo confronto
  const confrontKey = G.lastConfront
    ? `${G.lastConfront.objectiveId}-${G.lastConfront.winnerId}-${G.lastConfront.participants.length}`
    : 'none';

  return (
    <div className="game">
      <Banner data={banner} />

      <header className="topbar">
        <div className="topbar-row">
          <div>
            <strong>Fase:</strong> {PHASE_LABEL[ctx.phase] ?? ctx.phase}
          </div>
          <div>
            <strong>Turno:</strong> {playerName(G, ctx.currentPlayer)}
          </div>
          <div>
            <strong>Objetivos:</strong>{' '}
            {G.objectiveDeck.length + G.battlefield.length}
          </div>
          <div className="me">
            <img
              src={faction.image}
              alt={faction.name}
              className="faction-icon"
            />
            <span>
              Você é o <strong>Jogador {playerID}</strong> — {faction.name}
            </span>
          </div>
          {activeRules.length > 0 && (
            <div className="rules-tag">{activeRules.join(' · ')}</div>
          )}
        </div>
        <StepIndicator G={G} ctx={ctx} />
      </header>

      <main className="layout">
        {/* Coluna esquerda */}
        <aside className="col-left">
          <section>
            <h3>Minha mão</h3>
            {stepHint && <p className="hint">{stepHint}</p>}
            <div className="hand">
              {me.hand.map((id: string) => {
                const c = MILITARY_BY_ID[id];
                const isSelected = selected === id;
                const clickable = canAdvance || canReinforce;
                return (
                  <Card
                    key={id}
                    src={c.image}
                    alt={c.name}
                    className={isSelected ? 'selected' : ''}
                    onClick={
                      clickable
                        ? () => setSelected(isSelected ? null : id)
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </section>

          {asymmetric && (
            <section>
              <h3>Vantagem da facção</h3>
              <p className="hint">
                No Confronto: +1 ou −1 em <strong>uma</strong> unidade{' '}
                <strong>{TYPE_LABEL[faction.bonusType as MilitaryType]}</strong>{' '}
                sua, <em>ou</em> alterar o tipo dela.
              </p>
            </section>
          )}

          {isReinforce && (
            <section className="reinforce-actions">
              <h3>Reforço</h3>
              {contested && (
                <p className="hint">
                  Confronto em: <strong>{contested.name}</strong>
                </p>
              )}
              {canReinforce ? (
                <>
                  <p className="hint">
                    Escolha uma carta na mão, então:
                  </p>
                  <button
                    disabled={!selected}
                    onClick={() => {
                      if (!selected) return;
                      moves.reinforceCard(selected);
                      clearSelection();
                    }}
                  >
                    Reforçar com{' '}
                    {selected ? MILITARY_BY_ID[selected].name : '…'}
                  </button>
                  <button
                    onClick={() => {
                      moves.passReinforce();
                      clearSelection();
                    }}
                  >
                    Passar
                  </button>
                </>
              ) : (
                <p className="hint">Aguardando os demais jogadores…</p>
              )}
            </section>
          )}

          {isModify && (
            <section className="reinforce-actions">
              <h3>Vantagem de facção</h3>
              {contested && (
                <p className="hint">
                  Confronto em: <strong>{contested.name}</strong> — cartas
                  reveladas.
                </p>
              )}
              {canModify ? (
                <>
                  <p className="hint">
                    Escolha <strong>uma</strong> unidade{' '}
                    {TYPE_LABEL[faction.bonusType as MilitaryType]} sua:
                  </p>
                  {myModifiable.map(({ att, idx }) => {
                    const base = MILITARY_BY_ID[att.cardId];
                    const value = base.value + att.valueMod;
                    const type: MilitaryType =
                      att.typeOverride ?? base.type;
                    return (
                      <div className="mod-row" key={idx}>
                        <img
                          src={base.image}
                          alt={base.name}
                          className="card-mini"
                          draggable={false}
                        />
                        <div className="mod-buttons">
                          <button
                            disabled={value >= MAX_VALUE}
                            onClick={() => moves.modifyCard(idx, 'plus')}
                          >
                            +1
                          </button>
                          <button
                            disabled={value <= MIN_VALUE}
                            onClick={() => moves.modifyCard(idx, 'minus')}
                          >
                            −1
                          </button>
                          {MILITARY_TYPES.filter((t) => t !== type).map(
                            (t) => (
                              <button
                                key={t}
                                onClick={() =>
                                  moves.modifyCard(idx, 'type', t)
                                }
                              >
                                → {TYPE_LABEL[t]}
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={() => moves.passModify()}>
                    Não modificar
                  </button>
                </>
              ) : (
                <p className="hint">Aguardando os demais jogadores…</p>
              )}
            </section>
          )}

          {isPlay && (
            <section>
              <h3>Mercado</h3>
              {isMyTurn && !hasAdvanced && (
                <p className="hint">
                  Jogue uma carta em um objetivo antes de recrutar.
                </p>
              )}
              <div className="market">
                {G.market.map((id: string, i: number) => {
                  const c = MILITARY_BY_ID[id];
                  return (
                    <Card
                      key={id}
                      src={c.image}
                      alt={c.name}
                      onClick={
                        canRecruit
                          ? () => moves.recruit('market', i)
                          : undefined
                      }
                    />
                  );
                })}
                <div
                  className="deck-button"
                  onClick={
                    canRecruit ? () => moves.recruit('deck') : undefined
                  }
                  style={{ opacity: canRecruit ? 1 : 0.5 }}
                >
                  <img
                    src={CARD_BACKS.military}
                    alt="Deck militar"
                    className="card-img"
                    draggable={false}
                  />
                  <span>Comprar do deck</span>
                </div>
              </div>
            </section>
          )}
        </aside>

        {/* Coluna central */}
        <section className="col-center">
          <h3>Campo de Batalha</h3>
          <div className="battlefield">
            {G.battlefield.map((slot: any) => {
              const obj = OBJECTIVE_BY_ID[slot.objectiveId];
              const myCount = slot.attachments.filter(
                (a: any) => a.playerId === playerID,
              ).length;
              const canDropHere =
                canAdvance && !!selected && myCount < 3;

              return (
                <div key={slot.objectiveId} className="slot">
                  <div className="objective-name">{obj.name}</div>
                  <Card
                    src={obj.image}
                    alt={obj.name}
                    className={canDropHere ? 'highlight' : ''}
                    onClick={
                      canDropHere
                        ? () => {
                            moves.advance(selected!, slot.objectiveId);
                            clearSelection();
                          }
                        : undefined
                    }
                  />
                  <div className="attachments">
                    {slot.attachments.map((att: any, i: number) => {
                      const hidden = !att.cardId;
                      const base = hidden
                        ? null
                        : MILITARY_BY_ID[att.cardId];
                      const src = base ? base.image : CARD_BACKS.military;

                      const mods: string[] = [];
                      if (base && att.valueMod) {
                        mods.push(att.valueMod > 0 ? '+1' : '−1');
                      }
                      if (base && att.typeOverride) {
                        mods.push(
                          `→ ${TYPE_LABEL[att.typeOverride as MilitaryType]}`,
                        );
                      }

                      const tag = G.players[att.playerId]?.isAutoma
                        ? `A${att.playerId}`
                        : `J${att.playerId}`;

                      return (
                        <div
                          key={i}
                          className="mini"
                          /* A key={i} garante que uma nova carta no slot
                             recebe um novo índice e dispara a animação
                             `attachIn` no mount. */
                        >
                          <img
                            src={src}
                            alt={
                              hidden
                                ? 'Carta oculta'
                                : base?.name ?? 'Carta'
                            }
                            className="card-mini"
                            draggable={false}
                          />
                          <small>{tag}</small>
                          {mods.length > 0 && (
                            <small className="badge">
                              {mods.join(' ')}
                            </small>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Coluna direita */}
        <aside className="col-right">
          <section>
            <h3>Jogadores</h3>
            <ul className="players">
              {Object.entries(G.players).map(([pid, p]: any) => {
                const f = FACTION_BY_ID[p.factionId];
                return (
                  <li
                    key={pid}
                    className={pid === ctx.currentPlayer ? 'current' : ''}
                  >
                    <img
                      src={f.image}
                      alt={f.name}
                      className="faction-icon"
                    />
                    <div>
                      <div>
                        <strong>{playerName(G, pid)}</strong>
                        {pid === playerID && solo ? ' (você)' : ''}
                      </div>
                      <div>{p.objectivesWon.length} objetivo(s)</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {G.lastConfront && (
            <section key={confrontKey} className="confront-result">
              <h3>Último confronto</h3>
              <p>
                <strong>Vencedor:</strong>{' '}
                {playerName(G, G.lastConfront.winnerId)}
              </p>
              <ul>
                {G.lastConfront.participants.map((p: any) => (
                  <li
                    key={p.playerId}
                    className={
                      p.playerId === G.lastConfront.winnerId
                        ? 'winner'
                        : ''
                    }
                  >
                    {playerName(G, p.playerId)} — Nível {p.level} (
                    {p.description}) / soma {p.totalValue}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tela inicial                                                        */
/* ------------------------------------------------------------------ */

function Lobby({ onStart }: { onStart: (o: GameOptions) => void }) {
  const [solo, setSolo] = useState(false);
  const [numPlayers, setNumPlayers] = useState(4);
  const [automas, setAutomas] = useState(1);
  const [long, setLong] = useState(false);
  const [asymmetric, setAsymmetric] = useState(false);

  return (
    <div className="lobby">
      <h1>D.I.E.S.E.L.</h1>
      <p className="hint">
        Distopia · Indústria · Estratégia · Supremacia · Energia · Leviatãs
      </p>

      <h3>Modo de jogo</h3>
      <label>
        <input
          type="radio"
          checked={!solo}
          onChange={() => setSolo(false)}
        />{' '}
        Multijogador (hotseat)
      </label>
      <label>
        <input
          type="radio"
          checked={solo}
          onChange={() => setSolo(true)}
        />{' '}
        Solo contra Autômatos
      </label>

      {!solo ? (
        <>
          <h3>Jogadores</h3>
          <select
            value={numPlayers}
            onChange={(e) => setNumPlayers(Number(e.target.value))}
          >
            <option value={2}>2 jogadores</option>
            <option value={3}>3 jogadores</option>
            <option value={4}>4 jogadores</option>
          </select>
        </>
      ) : (
        <>
          <h3>Dificuldade</h3>
          <select
            value={automas}
            onChange={(e) => setAutomas(Number(e.target.value))}
          >
            <option value={1}>Fácil — vencer 1 autômato</option>
            <option value={2}>Moderado — vencer 2 autômatos</option>
            <option value={3}>Difícil — vencer 3 autômatos</option>
          </select>
          <p className="hint">
            No modo solo você só vence se conquistar TODOS os objetivos.
          </p>
        </>
      )}

      <h3>Regras opcionais</h3>
      <label>
        <input
          type="checkbox"
          checked={long}
          onChange={(e) => setLong(e.target.checked)}
        />{' '}
        Partida longa (usa os 12 objetivos)
      </label>
      <label>
        <input
          type="checkbox"
          checked={asymmetric}
          onChange={(e) => setAsymmetric(e.target.checked)}
        />{' '}
        Facções assimétricas
      </label>

      <button
        onClick={() =>
          onStart({ numPlayers, long, asymmetric, solo, automas })
        }
      >
        Iniciar partida
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Raiz                                                                */
/* ------------------------------------------------------------------ */

function GameRoot({
  options,
  onExit,
}: {
  options: GameOptions;
  onExit: () => void;
}) {
  const total = totalPlayers(options);

  const DieselClient = useMemo(
    () =>
      Client({
        game: createDiesel(options),
        numPlayers: total,
        board: Board,
        multiplayer: Local(),
        debug: false,
      }),
    [options, total],
  );

  return (
    <>
      {Array.from({ length: total }, (_, i) => (
        <DieselClient key={i} playerID={String(i)} matchID="hotseat" />
      ))}
      <div className="exit-wrap">
        <button onClick={onExit}>Voltar ao menu</button>
      </div>
    </>
  );
}

export default function App() {
  const [options, setOptions] = useState<GameOptions | null>(null);

  return options ? (
    <GameRoot options={options} onExit={() => setOptions(null)} />
  ) : (
    <Lobby onStart={setOptions} />
  );
}