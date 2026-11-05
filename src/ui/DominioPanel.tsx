import type { GameState } from '../game/types';
import { FACTION_BY_ID, OBJECTIVE_BY_ID } from '../game/data';
import { TYPE_LABEL } from '../game/combos';
import { handSizeFor, totalPV } from '../game/game';
import { playerName } from './shared';

/**
 * DOMÍNIO — a área à frente de cada jogador (manual, Setup passo 6):
 *  • a pilha com as 4 Cartas de Facção (cada uma que está no Campo de Batalha
 *    marcando as cartas jogadas fica "fora" do Domínio até o fim do Confronto);
 *  • as Cartas de Objetivo conquistadas (cada uma vale 1 PV) e as habilidades
 *    que elas concedem.
 */

const FACTION_CARDS = 4;
const BASE_HAND_SIZE = 3;

interface Props {
  G: GameState;
  /** Jogador cujo Domínio será exibido. */
  pid: string;
  /** true quando é o Domínio de quem está jogando (só muda o título). */
  mine: boolean;
}

export default function DominioPanel({ G, pid, mine }: Props) {
  const player = G.players[pid];
  if (!player) return null;

  const faction = FACTION_BY_ID[player.factionId];
  const pv = totalPV(G, pid);
  const conquered = player.objectivesWon
    .map((id) => OBJECTIVE_BY_ID[id])
    .filter((o) => o !== undefined);
  const powers = conquered.filter((o) => o.effects?.some((e) => e.kind.startsWith('post')));

  // Cartas de facção que estão marcando cartas no Campo de Batalha
  const deployed = G.battlefield.filter((s) =>
    s.attachments.some((a) => a.playerId === pid),
  ).length;
  const home = Math.max(0, FACTION_CARDS - deployed);
  const handMax = handSizeFor(G, pid);

  return (
    <section className="dominio">
      <h3>{mine ? 'Meu Domínio' : `Domínio · ${playerName(G, pid)}`}</h3>

      <div className="dm-head">
        <div className="dm-pile" title={`${home} de ${FACTION_CARDS} cartas de facção no Domínio`}>
          {home === 0 && <span className="dm-pile-empty" aria-hidden="true" />}
          {Array.from({ length: home }, (_, n) => (
            <img
              key={n}
              src={faction.image}
              alt={n === home - 1 ? faction.name : ''}
              className="dm-img"
              draggable={false}
              style={{ transform: `translate(${n * 3}px, ${-n * 3}px)` }}
            />
          ))}
          <span className="dm-count">{home}/{FACTION_CARDS}</span>
        </div>

        <div className="dm-summary">
          <strong>{faction.name}</strong>
          <div className="dm-pv">
            {pv}
            <small> PV</small>
          </div>
          <span>
            {deployed > 0
              ? `${deployed} carta(s) de facção em campo`
              : 'Todas as cartas de facção em casa'}
          </span>
          {handMax > BASE_HAND_SIZE && <span className="dm-bonus">Mão máxima: {handMax} cartas</span>}
        </div>
      </div>

      {G.options.asymmetric && (
        <p className="dm-advantage">
          <strong>Vantagem:</strong> +1 ou −1 em uma unidade {TYPE_LABEL[faction.bonusType]} durante
          um Confronto, ou trocar o tipo dela por qualquer outro.
        </p>
      )}

      {conquered.length === 0 ? (
        <p className="dm-empty">Nenhum Objetivo conquistado ainda.</p>
      ) : (
        <div className="dm-objs">
          {conquered.map((o, i) => (
            <figure
              key={`${o.id}-${i}`}
              className={`dm-obj ${powers.includes(o) ? 'power' : ''}`}
              title={o.text}
            >
              <img src={o.image} alt={o.name} draggable={false} />
              <figcaption>{o.name}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {powers.length > 0 && (
        <ul className="dm-abilities">
          {powers.map((o) => (
            <li key={o.id}>
              <strong>{o.name}</strong> {o.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
