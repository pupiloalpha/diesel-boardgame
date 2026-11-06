import type { GameState } from '../game/types';
import { FACTION_BY_ID, OBJECTIVE_BY_ID } from '../game/data';
import { rankPlayers, remainingObjectives } from '../game/game';
import { playerName } from './shared';

interface Props {
  G: GameState;
  nextPlayer?: string;
  onContinue: () => void;
}

export default function SupremaciaModal({ G, nextPlayer, onContinue }: Props) {
  const last = G.lastConfront;
  const conquered = last ? OBJECTIVE_BY_ID[last.objectiveId] : undefined;
  const ranking = rankPlayers(G);
  const remaining = remainingObjectives(G);
  const over = G.gameOver;
  const solo = G.options.solo;
  const soloVictoryRule = solo && (G.options.soloOnly ?? true); // regra especial do manual
  const total = Math.max(1, G.totalObjectives);

  const leaders = ranking.filter((r) => r.pv === ranking[0].pv);
  const tied = over && !soloVictoryRule && leaders.length > 1;
  const youWon = G.winnerId === '0';

  let verdict: string;
  if (!over) {
    verdict =
      `Ainda restam ${remaining} Carta(s) de Objetivo em disputa. O jogo continua` +
      (nextPlayer ? ` — vez de ${playerName(G, nextPlayer)}.` : '.');
  } else if (soloVictoryRule) {
    verdict = youWon
      ? 'A última Carta de Objetivo foi conquistada e você ficou com todas!'
      : 'A última Carta de Objetivo foi conquistada, mas no modo solo só vence quem conquista TODAS.';
  } else if (solo) {
    // Competitivo vs. Autômatos: vitória padrão por PV.
    verdict = `A última Carta de Objetivo foi conquistada! Vitória por maior PV: ${playerName(G, G.winnerId!)}.`;
  } else {
    verdict =
      'A última Carta de Objetivo foi conquistada! O jogo termina e vence quem tem mais PV.';
  }

  const isLeadRow = (pid: string, pv: number): boolean => {
    if (!over) return pv > 0 && pv === ranking[0].pv;
    if (soloVictoryRule) return youWon && pid === '0';
    return pid === G.winnerId;
  };

  return (
    <div
      className="ci-overlay sm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sm-title"
    >
      <div className={`sm-modal ${over ? 'final' : ''}`}>
        <div className="sm-kicker">Etapa 4 · Supremacia</div>
        <h2 id="sm-title">{over ? 'Fim da disputa' : 'Disputa decidida'}</h2>

        {last && conquered && (
          <p className="sm-lead">
            {last.winnerId ? (
              <>
                <strong>{playerName(G, last.winnerId)}</strong> conquistou{' '}
                <strong>{conquered.name}</strong> (+{conquered.pv} PV).
              </>
            ) : (
              <>
                <strong>{conquered.name}</strong> foi resolvido.
              </>
            )}
          </p>
        )}

        <ul className="sm-rank">
          {ranking.map((r) => {
            const f = FACTION_BY_ID[G.players[r.playerId].factionId];
            const lead = isLeadRow(r.playerId, r.pv);
            return (
              <li key={r.playerId} className={lead ? 'lead' : ''}>
                <img src={f.image} alt={f.name} draggable={false} />
                <span className="sm-name">
                  {lead && <b aria-hidden="true">★ </b>}
                  {playerName(G, r.playerId)}
                  <small>{f.name}</small>
                  <span className="sm-bar" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, (r.pv / total) * 100)}%` }} />
                  </span>
                </span>
                <span className="sm-pv">{r.pv} PV</span>
              </li>
            );
          })}
        </ul>

        <p className={`sm-verdict ${over ? 'final' : ''}`}>{verdict}</p>

        {tied && (
          <p className="sm-note">
            Empate em {ranking[0].pv} PV entre{' '}
            {leaders.map((l) => playerName(G, l.playerId)).join(', ')}. Critério de
            desempate: o jogador mais distante do Primeiro Jogador, no sentido horário.
          </p>
        )}

        <button className="sm-btn" onClick={onContinue} autoFocus>
          {over ? 'Ver resultado final' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}