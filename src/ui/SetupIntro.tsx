import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { GameState } from '../game/types';
import {
  CARD_BACKS,
  FACTION_BY_ID,
  MILITARY_CARDS,
  OBJECTIVE_BY_ID,
} from '../game/data';
import { TYPE_LABEL } from '../game/combos';
import { playerName } from './shared';

/**
 * Animação do SETUP, seguindo a ordem do manual:
 *  1. Deck de Objetivos        4. Mercado
 *  2. Campo de Batalha         5. Mãos iniciais
 *  3. Deck Militar + Descarte  6. Domínios (facções)
 */

const HAND_SIZE = 3;
const STEP_COUNT = 6;
const FIRST_DELAY_MS = 500;
const STEP_MS = 1800;

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/* ------------------------------------------------------------------ */
/* Peças visuais                                                       */
/* ------------------------------------------------------------------ */

interface CellProps {
  shown: boolean;
  /** Quantas posições à esquerda a carta "voa" até chegar (origem = deck). */
  k?: number;
  /** Ordem dentro do grupo (escalona o atraso). */
  i?: number;
  /** Deslocamento vertical inicial em px. */
  dy?: number;
  label?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Espaço fixo na mesa (tracejado) onde a carta aterrissa. */
function Cell({ shown, k = 0, i = 0, dy = 0, label, className = '', children }: CellProps) {
  return (
    <div className={`su-item ${className}`}>
      <div className="su-cell">
        {shown && (
          <div className="su-fly" style={vars({ '--k': k, '--i': i, '--dy': `${dy}px` })}>
            {children}
          </div>
        )}
      </div>
      {label !== undefined && <span className="su-label">{label}</span>}
    </div>
  );
}

/** Pilha de cartas (deck) com contador. */
function Pile({ src, count }: { src: string; count: number }) {
  const layers = Math.max(1, Math.min(4, count));
  return (
    <div className="su-pile">
      {Array.from({ length: layers }, (_, n) => (
        <img
          key={n}
          src={src}
          alt=""
          draggable={false}
          className="su-img"
          style={{ transform: `translate(${n * 2}px, ${-n * 2}px)` }}
        />
      ))}
      <span className="su-count">{count}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */

interface Props {
  G: GameState;
  onDone: () => void;
}

export default function SetupIntro({ G, onDone }: Props) {
  const [stage, setStage] = useState(0); // 0 = mesa vazia … 6 = tudo pronto
  const done = stage >= STEP_COUNT;

  useEffect(() => {
    if (stage >= STEP_COUNT) return;
    const t = window.setTimeout(
      () => setStage((s) => s + 1),
      stage === 0 ? FIRST_DELAY_MS : STEP_MS,
    );
    return () => window.clearTimeout(t);
  }, [stage]);

  const playerIds = Object.keys(G.players);
  const objTotal = G.totalObjectives;
  const slots = G.battlefield;
  const milTotal = MILITARY_CARDS.length;
  const marketSize = G.market.length;

  // Contadores que acompanham a distribuição
  const objInDeck = stage >= 2 ? objTotal - slots.length : objTotal;
  const milInDeck =
    stage >= 5
      ? milTotal - marketSize - HAND_SIZE * playerIds.length
      : stage >= 4
        ? milTotal - marketSize
        : milTotal;

  const steps = [
    {
      title: 'Deck de Objetivos',
      text: `Embaralhe e forme um deck com ${objTotal} Cartas de Objetivo, face para baixo${
        G.options.long ? ' (partida longa: todos os objetivos).' : ' (7 das 12 cartas).'
      }`,
    },
    {
      title: 'Campo de Batalha',
      text: `Revele ${slots.length} Cartas de Objetivo no centro da mesa. É nelas que as unidades serão anexadas.`,
    },
    {
      title: 'Deck Militar e Descarte',
      text: `Embaralhe as ${milTotal} Cartas Militares em um deck e deixe um espaço ao lado para o Descarte.`,
    },
    {
      title: 'Mercado',
      text: `Revele ${marketSize} cartas do deck militar. Elas formam o Mercado, de onde os jogadores recrutam.`,
    },
    {
      title: 'Mãos iniciais',
      text: `Cada jogador recebe ${HAND_SIZE} Cartas Militares do topo do deck (as mãos ficam ocultas).`,
    },
    {
      title: 'Domínios e facções',
      text:
        'Cada jogador assume uma Facção, que forma o seu Domínio.' +
        (G.options.solo
          ? ' Cada Autômato foi alocado aleatoriamente a 1 Objetivo e permanecerá nele.'
          : '') +
        (G.options.asymmetric
          ? ' Facções assimétricas: cada facção tem vantagem sobre as unidades do seu tipo.'
          : ''),
    },
  ];

  const current = !done && stage > 0 ? steps[stage - 1] : null;
  const active = done || stage === 0 ? null : stage <= 2 ? 'obj' : stage <= 4 ? 'mil' : 'pl';

  return (
    <div className="su-overlay" role="dialog" aria-modal="true" aria-labelledby="su-title">
      <div className="su-panel">
        <header className="su-header">
          <h2 id="su-title">Preparando a mesa</h2>
          <div className="su-dots" aria-hidden="true">
            {steps.map((_, n) => (
              <span key={n} className={`su-dot ${stage > n ? 'on' : ''}`} />
            ))}
          </div>
        </header>

        <div className="su-caption" key={done ? 'done' : stage} aria-live="polite">
          {done ? (
            <>
              <strong>Mesa pronta!</strong>
              <p>{playerName(G, G.firstPlayer)} é o primeiro jogador e inicia a partida.</p>
            </>
          ) : current ? (
            <>
              <strong>
                Passo {stage} de {STEP_COUNT} — {current.title}
              </strong>
              <p>{current.text}</p>
            </>
          ) : (
            <p>Embaralhando as cartas…</p>
          )}
        </div>

        <div className="su-table">
          {/* ================================================================
              Objetivos + Cartas Militares, lado a lado no desktop.
              ================================================================ */}
          <div className="su-mid">
            {/* Objetivos */}
            <div className={`su-row ${active === 'obj' ? 'active' : ''}`}>
              <div className="su-row-head">Objetivos</div>
              <div className="su-cells">
                <Cell shown={stage >= 1} dy={-40} label="Deck">
                  <Pile src={CARD_BACKS.objectives} count={objInDeck} />
                </Cell>
                {slots.map((slot, i) => {
                  const obj = OBJECTIVE_BY_ID[slot.objectiveId];
                  const tags = Object.entries(G.automaSlot)
                    .filter(([, idx]) => idx === i)
                    .map(([pid]) => `A${pid}`);
                  return (
                    <Cell
                      key={slot.objectiveId}
                      shown={stage >= 2}
                      k={i + 1}
                      i={i}
                      label={
                        <>
                          {obj.name}
                          {stage >= 6 &&
                            tags.map((t) => (
                              <span key={t} className="su-tag">{t}</span>
                            ))}
                        </>
                      }
                    >
                      <img className="su-img" src={obj.image} alt={obj.name} draggable={false} />
                    </Cell>
                  );
                })}
              </div>
            </div>

            {/* Cartas Militares */}
            <div className={`su-row ${active === 'mil' ? 'active' : ''}`}>
              <div className="su-row-head">Cartas Militares</div>
              <div className="su-cells">
                <Cell shown={stage >= 3} dy={-40} label="Deck">
                  <Pile src={CARD_BACKS.military} count={milInDeck} />
                </Cell>
                <Cell shown={false} label="Descarte" className={stage >= 3 ? '' : 'su-dim'} />
                {G.market.map((id, i) => (
                  <Cell key={`${id}-${i}`} shown={stage >= 4} k={i + 2} i={i} label={i === 0 ? 'Mercado' : ''}>
                    <img className="su-img" src={CARD_BACKS.military} alt="Carta do Mercado" draggable={false} />
                  </Cell>
                ))}
              </div>
            </div>
          </div>

          {/* ================================================================
              Jogadores — grid 2×2; info (nome / facção / bônus) ACIMA
              das cartas de facção + mão.
              ================================================================ */}
          <div className={`su-row ${active === 'pl' ? 'active' : ''}`}>
            <div className="su-row-head">Jogadores</div>
            <div className="su-players">
              {playerIds.map((pid, pi) => {
                const faction = FACTION_BY_ID[G.players[pid].factionId];
                return (
                  <div className="su-player" key={pid}>
                    <div className="su-player-info">
                      <strong>{playerName(G, pid)}</strong>
                      <span>{stage >= 6 ? faction.name : '—'}</span>
                      {G.options.asymmetric && stage >= 6 && (
                        <em>Bônus: {TYPE_LABEL[faction.bonusType]}</em>
                      )}
                    </div>

                    <div className="su-player-cards">
                      <Cell shown={stage >= 6} i={pi} dy={30}>
                        <img className="su-img" src={faction.image} alt={faction.name} draggable={false} />
                      </Cell>
                      <div className="su-hand">
                        {Array.from({ length: HAND_SIZE }, (_, h) => (
                          <Cell key={h} shown={stage >= 5} i={pi * HAND_SIZE + h} dy={-220}>
                            <img className="su-img" src={CARD_BACKS.military} alt="Carta da mão" draggable={false} />
                          </Cell>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="su-actions">
          {done ? (
            <button className="su-btn-primary" onClick={onDone} autoFocus>
              Começar partida
            </button>
          ) : (
            <button className="su-btn-ghost" onClick={() => setStage(STEP_COUNT)}>
              Pular animação
            </button>
          )}
        </div>
      </div>
    </div>
  );
}