import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GameState } from '../game/types';
import { CARD_BACKS, FACTION_BY_ID, OBJECTIVE_BY_ID } from '../game/data';
import { rankPlayers } from '../game/game';
import { playerName } from './shared';

interface Props {
  G: GameState;
  onExit: () => void;
}

const REVEAL_DELAY_MS = 1100;
const SPARKS = 18;

export default function VictoryModal({ G, onExit }: Props) {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setOpened(true), REVEAL_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  const solo = G.options.solo;
  const soloVictoryRule = solo && (G.options.soloOnly ?? true);
  const youWon = G.winnerId === '0';
  const defeat = soloVictoryRule && !youWon;

  const ranking = rankPlayers(G).map((r) => {
    const p = G.players[r.playerId];
    return {
      pid: r.playerId,
      faction: FACTION_BY_ID[p.factionId],
      objectives: r.objectives,
      pv: r.pv,
    };
  });

  const winner = G.winnerId ? G.players[G.winnerId] : undefined;
  const faction = winner ? FACTION_BY_ID[winner.factionId] : undefined;

  const title = soloVictoryRule
    ? (youWon ? 'Vitória!' : 'Derrota')
    : 'Fim de jogo';

  const subtitle = soloVictoryRule
    ? (youWon
        ? 'Você conquistou todos os objetivos.'
        : 'Você não conquistou todos os objetivos — no modo solo essa é a única condição de vitória.')
    : G.winnerId
      ? `Vencedor: ${playerName(G, G.winnerId)}`
      : '';

  const isWinnerRow = (pid: string) => !defeat && pid === G.winnerId;

  return (
    <div className="vm-overlay" role="dialog" aria-modal="true" aria-labelledby="vm-title">
      <div className={`vm-modal ${defeat ? 'defeat' : ''}`}>
        <h1 id="vm-title">{title}</h1>
        <p className="vm-sub">{subtitle}</p>

        {faction && !defeat && (
          <div className="vm-stage">
            <div className={`vm-rays ${opened ? 'on' : ''}`} aria-hidden="true" />
            {opened &&
              Array.from({ length: SPARKS }, (_, n) => (
                <span
                  key={n}
                  className="vm-spark"
                  aria-hidden="true"
                  style={
                    {
                      '--a': `${n * (360 / SPARKS)}deg`,
                      '--d': `${150 + (n % 3) * 45}px`,
                      '--delay': `${(n % 6) * 70}ms`,
                    } as CSSProperties
                  }
                />
              ))}

            <div className="vm-float">
              <div className={`vm-card ${opened ? 'open' : ''}`}>
                <div className="vm-face back">
                  <img src={CARD_BACKS.factions} alt="Verso da carta de facção" draggable={false} />
                </div>
                <div className="vm-face front">
                  <img src={faction.image} alt={faction.name} draggable={false} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="vm-caption" aria-live="polite">
          {faction && !defeat
            ? opened
              ? <>Facção campeã: <strong>{faction.name}</strong></>
              : 'Revelando a facção campeã…'
            : null}
        </div>

        <ul className="vm-rank">
          {ranking.map((r) => (
            <li key={r.pid} className={isWinnerRow(r.pid) ? 'winner' : ''}>
              <img src={r.faction.image} alt={r.faction.name} draggable={false} />
              <span className="vm-rank-name">
                {isWinnerRow(r.pid) && <b aria-hidden="true">★ </b>}
                {playerName(G, r.pid)}
                <small>{r.faction.name}</small>
              </span>
              <span className="vm-rank-pv">
                {r.pv} PV
                <small>{r.objectives} objetivo(s)</small>
              </span>
            </li>
          ))}
        </ul>

        <button className="vm-btn" onClick={onExit}>
          Voltar ao menu
        </button>
      </div>
    </div>
  );
}