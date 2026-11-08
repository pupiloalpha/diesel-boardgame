import { useEffect } from 'react';
import './manual.css';

interface Props {
  onClose: () => void;
}

const STRATEGY: { level: number; name: string; rule: string }[] = [
  { level: 1, name: 'Sem estratégia',        rule: 'Maior valor total somando os valores das cartas (critério de desempate padrão)' },
  { level: 2, name: 'Ataque sincronizado',   rule: '1 par de números iguais' },
  { level: 3, name: 'Múltiplas frentes',     rule: '3 cartas de tipos diferentes' },
  { level: 4, name: 'Força uniforme',        rule: '3 cartas de mesmo tipo' },
  { level: 5, name: 'Coordenação total',     rule: 'Sequência de 3 cartas' },
  { level: 6, name: 'Operação conjunta',     rule: '1 coleção de 3 cartas de mesmo valor' },
  { level: 7, name: 'Estratégia implacável', rule: 'Sequência de 3 cartas de mesmo tipo' },
];

const ASYMMETRIC: { faction: string; unit: string }[] = [
  { faction: 'Nova America',            unit: 'marítima'  },
  { faction: 'Confederação Européia',   unit: 'aérea'     },
  { faction: 'Nações Islâmicas',        unit: 'terrestre' },
  { faction: 'Império Asiático',        unit: 'Herói'     },
];

/** Caminho do PDF do manual em `public/`. Renomeie o arquivo para `manual.pdf`. */
const MANUAL_PDF_HREF = `${import.meta.env.BASE_URL}manual.pdf`;

export default function ManualModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="mn-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mn-title"
      onClick={onClose}
    >
      <div className="mn-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mn-header">
          <h2 id="mn-title">Manual — D.I.E.S.E.L.</h2>
          <button className="mn-close" onClick={onClose} aria-label="Fechar manual">✕</button>
        </header>

        <div className="mn-body">
          <section className="mn-sec">
            <h3>Objetivo do jogo</h3>
            <p>
              Ter a maior pontuação de <strong>Pontos de Vitória (PV)</strong> ao final da partida.
              O jogo termina quando o <strong>deck de Objetivos</strong> se esgota — ou seja, quando
              a última <strong>Carta de Objetivo</strong> em disputa for conquistada.
            </p>
          </section>

          <section className="mn-sec">
            <h3>Componentes</h3>
            <ul>
              <li><strong>40 Cartas Militares</strong> — valores de 1 a 10 em 4 tipos (Terrestre, Aéreo, Marítimo, Herói).</li>
              <li><strong>12 Cartas de Objetivo</strong> — alvos estratégicos que concedem 1 PV cada.</li>
              <li><strong>16 Cartas de Facção</strong> — 4 facções: Nova America, Confederação Européia, Nações Islâmicas e Império Asiático (4 cartas por facção).</li>
            </ul>
          </section>

          <section className="mn-sec">
            <h3>Cartas Militares</h3>
            <p>
              Representam as unidades de guerra. Cada uma tem um <strong>valor de 1 a 10</strong>{' '}
              (nível de força) e pertence a um dos <strong>4 tipos</strong>:
              Terrestre, Aéreo, Marítimo e Herói.
            </p>
          </section>

          <section className="mn-sec">
            <h3>Cartas de Objetivo</h3>
            <p>
              São as conquistas que dão <strong>PV</strong> ao seu dono. Cada carta pode trazer
              efeitos que restringem tipos de unidade ou alteram valores e tipos durante o confronto.
            </p>
          </section>

          <section className="mn-sec">
            <h3>Cartas de Facção</h3>
            <p>
              Formam o <strong>Domínio</strong> de cada jogador (a área à sua frente). Cada jogador
              começa com <strong>4 cartas de facção</strong>; uma delas é colocada sob as cartas
              militares jogadas em um objetivo para identificar a autoria. No máximo 4 facções em jogo.
            </p>
          </section>

          <section className="mn-sec">
            <h3>Setup</h3>
            <ol>
              <li>Embaralhe <strong>7 das 12</strong> Cartas de Objetivo, formando o deck de Objetivos.</li>
              <li>Revele <strong>3</strong> cartas do deck no centro: formam o <strong>Campo de Batalha</strong>.</li>
              <li>Embaralhe as <strong>40 Cartas Militares</strong> em um deck; deixe espaço para o Descarte.</li>
              <li>Revele <strong>3</strong> cartas militares como <strong>Mercado</strong>.</li>
              <li>Cada jogador recebe <strong>3 cartas militares</strong> (mão inicial oculta).</li>
              <li>Escolha o primeiro jogador; cada um escolhe uma facção e forma seu Domínio com as 4 cartas da facção.</li>
            </ol>
          </section>

          <section className="mn-sec">
            <h3>Sequência de jogo</h3>
            <p>Em sentido horário, cada jogador executa seu turno em 4 etapas:</p>
            <ol>
              <li>
                <strong>Avanço</strong> — Jogue 1 carta militar anexa a uma das Cartas de Objetivo em jogo.
                Se for a primeira carta sua naquele objetivo, ela entra <em>revelada</em>; caso contrário, <em>oculta</em>.
              </li>
              <li>
                <strong>Recrutamento</strong> — Compre 1 carta do Mercado (repõe imediatamente) ou do topo
                do deck militar, até completar a mão de 3 cartas.
              </li>
              <li>
                <strong>Confronto</strong> — Sempre que a <strong>3ª carta militar</strong> de um jogador
                é anexada a um objetivo, um Confronto é iniciado (veja abaixo). Caso contrário, avance.
              </li>
              <li>
                <strong>Supremacia</strong> — Se a última Carta de Objetivo foi conquistada neste turno,
                a partida acaba e vence quem tem mais PV. Senão, passa a vez.
              </li>
            </ol>
          </section>

          <section className="mn-sec">
            <h3>Etapas do Confronto</h3>
            <ol>
              <li>
                <strong>Reforços</strong> — A partir do próximo jogador em sentido horário, cada um pode
                incluir <strong>+1 carta</strong> da mão no objetivo disputado (ou passar), repondo a mão em seguida.
              </li>
              <li>
                <strong>Confronto</strong> — Todas as cartas são reveladas; cada jogador calcula seu
                Nível de Força de Combate pela Tabela de Estratégia. Vence o maior nível; empate é
                decidido pela maior soma de valores; persistindo, vence o jogador mais distante do
                primeiro jogador em sentido horário.
              </li>
              <li>
                <strong>Conquista</strong> — As cartas militares do objetivo vão para o descarte. O vencedor
                leva a Carta de Objetivo para o seu Domínio (+1 PV). Uma nova Carta de Objetivo é revelada
                no Campo de Batalha, se houver.
              </li>
            </ol>
          </section>

          <section className="mn-sec">
            <h3>Tabela de Estratégia</h3>
            <div className="mn-table-wrap">
              <table className="mn-table">
                <thead>
                  <tr><th>Nível</th><th>Nome</th><th>Combinação</th></tr>
                </thead>
                <tbody>
                  {STRATEGY.map((s) => (
                    <tr key={s.level}>
                      <td>{s.level}</td>
                      <td>{s.name}</td>
                      <td>{s.rule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mn-note">
              <strong>Observação 1.</strong> Cada carta jogada no conflito
              só pode compor <strong>uma combinação</strong>. Prevalece
              sempre a de maior nível. Ex.: um par de “8” dentro de uma
              trinca do mesmo tipo — vale só o Nível 4.
            </p>
            <p className="mn-note">
              <strong>Observação 2.</strong> Combinações que não compartilham
              cartas somam seus níveis (2 pares = Nível 4).
            </p>
            <p className="mn-note">
              <strong>Observação 3.</strong> Desempate: (A) maior soma de
              valores; (B) jogador mais distante do Primeiro Jogador em sentido
              horário; (C) <strong>maior nível de estratégia entre as cartas
              da mão</strong>.
            </p>
          </section>

          <section className="mn-sec">
            <h3>Outras regras</h3>
            <ul>
              <li>
                <strong>Ficar sem jogada:</strong> se você (ou o Autômato) não
                puder jogar <em>nenhuma</em> carta da mão por restrição de tipo
                dos Objetivos, compre cartas do topo do deck até obter uma
                jogável. Descarte as demais sacadas. As 3 cartas originais
                permanecem na mão.
              </li>
              <li>
                <strong>Desempate final:</strong> se 2+ jogadores empatarem em
                PV ao fim da partida, vence o que tiver o{' '}
                <strong>maior nível de estratégia entre as cartas da mão</strong>.
              </li>
            </ul>
          </section>

          <section className="mn-sec">
            <h3>Regras opcionais</h3>

            <h4>Partida longa</h4>
            <p>
              Utilize as <strong>12</strong> Cartas de Objetivo em vez de 7. A partida fica mais longa
              e estratégica.
            </p>

            <h4>Facções assimétricas</h4>
            <p>
              Cada facção recebe uma vantagem única que se soma aos efeitos das Cartas de Objetivo.
              Durante um confronto, o jogador pode aplicar <em>+1 ou −1</em> em uma unidade do seu tipo
              de bônus, ou trocar o tipo dela por qualquer outro:
            </p>
            <ul>
              {ASYMMETRIC.map((a) => (
                <li key={a.faction}>
                  <strong>{a.faction}</strong> — unidade <strong>{a.unit}</strong>.
                </li>
              ))}
            </ul>

<h4>Modo solo (contra Autômatos)</h4>
<ul>
  <li>Jogue contra 1 a 3 Autômatos.</li>
  <li>Você <strong>só vence</strong> conquistando <strong>TODAS</strong> as Cartas de Objetivo.</li>
  <li>Cada Autômato é alocado aleatoriamente a 1 objetivo no setup e sempre joga nele.</li>
  <li>Na vez do Autômato, ele compra uma carta do Mercado e a anexa <em>revelada</em> ao seu objetivo.</li>
  <li>Em confrontos, o Autômato sempre aplica a vantagem de facção / objetivo / habilidade conquistada que maximize sua força.</li>
</ul>

<h4>Competitivo vs. Autômatos</h4>
<p>
  Uma variação legítima das regras: os Autômatos jogam exatamente como acima, mas a
  <strong> condição de vitória</strong> é a <strong>padrão competitiva</strong> — vence quem
  tiver mais Pontos de Vitória quando o deck de Objetivos se esgotar.
</p>
<ul>
  <li>Não é preciso conquistar todos os objetivos.</li>
  <li>O empate segue o critério padrão do manual: mais distante do primeiro jogador em sentido horário.</li>
  <li>Combinável com <em>partida longa</em> e <em>facções assimétricas</em>.</li>
</ul>

<p><strong>Níveis de inteligência</strong> (escolhidos no menu):</p>
<ul>
  <li><strong>Básico</strong> — sorteia uma carta válida do Mercado, sem otimizar combinações. Passa nos Reforços.</li>
  <li><strong>Otimizado</strong> — escolhe a carta do Mercado que maximiza a melhor combinação do seu Objetivo (par, sequência, trinca). Passa nos Reforços.</li>
  <li><strong>Estratégico</strong> — como o Otimizado, mas também <em>reforça</em> nos confrontos em que o seu Objetivo está em disputa, sempre que a melhor carta do Mercado o fizer superar os adversários <em>visíveis</em>.</li>
</ul>
            <p>
              <strong>Níveis de inteligência</strong> (escolhidos no menu):
            </p>
            <ul>
              <li>
                <strong>Básico</strong> — sorteia uma carta válida do Mercado, sem
                otimizar combinações. Passa nos Reforços.
              </li>
              <li>
                <strong>Otimizado</strong> — escolhe a carta do Mercado que
                maximiza a melhor combinação do seu Objetivo (par, sequência,
                trinca). Passa nos Reforços.
              </li>
              <li>
                <strong>Estratégico</strong> — como o Otimizado, mas também{' '}
                <em>reforça</em> nos confrontos em que o seu Objetivo está em
                disputa, sempre que a melhor carta do Mercado o fizer superar
                os adversários <em>visíveis</em>.
              </li>
            </ul>
          </section>
        </div>

        <footer className="mn-footer">
          <a
            className="mn-btn mn-btn-download"
            href={MANUAL_PDF_HREF}
            download="manual-diesel.pdf"
            target="_blank"
            rel="noopener noreferrer"
          >
            Baixar PDF do manual
          </a>
          <button className="mn-btn" onClick={onClose} autoFocus>Fechar</button>
        </footer>
      </div>
    </div>
  );
}
