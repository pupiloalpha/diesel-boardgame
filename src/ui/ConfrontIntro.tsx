import type { GameState } from '../game/types';
import { FACTION_BY_ID, OBJECTIVE_BY_ID } from '../game/data';
import { conflictThreshold } from '../game/game';
import { playerName } from './shared';

interface Props {
  G: GameState;
  onContinue: () => void;
}

const STRATEGY: { level: number; name: string; rule: string }[] = [
  { level: 1, name: 'Sem estratégia', rule: 'Maior soma dos valores das cartas' },
  { level: 2, name: 'Ataque sincronizado', rule: '1 par de valores iguais' },
  { level: 3, name: 'Força uniforme', rule: '3 cartas do mesmo tipo' },
  { level: 4, name: 'Coordenação total', rule: 'Sequência de 3 cartas' },
  { level: 5, name: 'Operação conjunta', rule: '3 cartas de mesmo valor' },
  { level: 6, name: 'Estratégia implacável', rule: 'Sequência de 3 cartas do mesmo tipo' },
];

export default function ConfrontIntro({ G, onContinue }: Props) {
  const obj = G.pendingConfront ? OBJECTIVE_BY_ID[G.pendingConfront] : undefined;
  const slot = G.battlefield.find((s) => s.objectiveId === G.pendingConfront);
  if (!obj || !slot) return null;

  const threshold = conflictThreshold(obj.id);
  const trigger = G.confrontTriggeredBy;

  const counts = new Map<string, number>();
  slot.attachments.forEach((a) =>
    counts.set(a.playerId, (counts.get(a.playerId) ?? 0) + 1),
  );

  return (
    <div className="ci-overlay" role="dialog" aria-modal="true" aria-labelledby="ci-title">
      <div className="ci-modal">
        <div className="ci-kicker">Confronto iminente</div>
        <h2 id="ci-title">{obj.name}</h2>
        <p className="ci-lead">
          {trigger !== null && <strong>{playerName(G, trigger)}</strong>} anexou a {threshold}ª carta
          a este objetivo. Agora os jogadores disputam quem ficará com ele.
        </p>

        <div className="ci-body">
          <div className="ci-objective">
            <img src={obj.image} alt={obj.name} className="ci-card" draggable={false} />
            {obj.text && <p>{obj.text}</p>}
          </div>

          <div className="ci-info">
            <div className="ci-participants">
              {[...counts.entries()].map(([pid, n]) => {
                const f = FACTION_BY_ID[G.players[pid].factionId];
                return (
                  <div key={pid} className="ci-chip">
                    <img src={f.image} alt={f.name} draggable={false} />
                    <span>
                      {playerName(G, pid)}
                      <small>{n} carta(s)</small>
                    </span>
                  </div>
                );
              })}
            </div>

            <ol className="ci-steps">
              <li>
                <strong>Reforços</strong>
                <span>
                  Os demais jogadores, em sentido horário, podem incluir mais uma carta da mão
                  neste objetivo (a mão é reposta em seguida) ou passar.
                </span>
              </li>
              <li>
                <strong>Confronto</strong>
                <span>
                  Todas as cartas são reveladas. Cada jogador forma sua melhor combinação pela
                  Tabela de Estratégia e o maior nível vence.
                </span>
              </li>
              <li>
                <strong>Conquista</strong>
                <span>
                  As cartas militares vão para o descarte, cada facção volta ao seu Domínio e o
                  vencedor leva o Objetivo (+1 PV).
                </span>
              </li>
            </ol>

            <p className="ci-note">
              Entre os Reforços e o Confronto, quem tiver vantagem de facção, efeito do objetivo
              ou habilidade conquistada poderá ajustar uma carta. Empates: vence a maior soma de
              valores; persistindo, o jogador mais distante do primeiro jogador no sentido horário.
            </p>

            <details className="ci-table">
              <summary>Tabela de Estratégia</summary>
              <ul>
                {STRATEGY.map((s) => (
                  <li key={s.level}>
                    <b>Nível {s.level}</b> · {s.name} — {s.rule}
                  </li>
                ))}
              </ul>
              <p>Combinações que não compartilham cartas somam seus níveis (2 pares = nível 4).</p>
            </details>
          </div>
        </div>

        <button className="ci-btn" onClick={onContinue} autoFocus>
          Iniciar Confronto
        </button>
      </div>
    </div>
  );
}
