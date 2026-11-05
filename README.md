# D.I.E.S.E.L.

**D.I.E.S.E.L.** é um jogo de estratégia de cartas para navegador, ambientado em uma distopia de indústria, energia e supremacia. Dispute objetivos usando unidades militares, forme combinações de combate e aproveite as habilidades das facções e dos locais.

> **D.I.E.S.E.L.**: Distopia · Indústria · Estratégia · Supremacia · Energia · Leviatãs

## Como jogar

Escolha o modo e as opções no menu inicial e inicie uma partida. Em cada turno, jogue uma carta da mão em um objetivo disponível e, em seguida, recrute uma carta do Mercado ou do deck. Quando uma disputa atinge o número necessário de unidades, começa um confronto:

1. Os demais jogadores podem reforçar a disputa ou passar.
2. As cartas são reveladas e os jogadores elegíveis podem fazer uma modificação.
3. As combinações de cartas são comparadas; o vencedor conquista o objetivo.
4. A partida termina quando todos os objetivos forem conquistados.

O nível da combinação é o principal critério de combate; a soma dos valores das cartas desempata. Os objetivos podem impor restrições ou conceder efeitos, e as facções assimétricas oferecem vantagens próprias.

## Modos e opções

- **Multijogador (hotseat):** de 2 a 4 jogadores compartilham o mesmo dispositivo e jogam em turnos.
- **Solo contra Autômatos:** jogue contra 1, 2 ou 3 autômatos. Para vencer, conquiste todos os objetivos.
- **Partida longa:** usa os 12 objetivos, em vez da seleção padrão de 7.
- **Facções assimétricas:** ativa os bônus específicos das facções.

## Executar localmente

É necessário ter [Node.js](https://nodejs.org/) e npm instalados.

```bash
npm install
npm run dev
```

O Vite exibirá no terminal o endereço local para abrir no navegador.

## Scripts disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor de desenvolvimento do Vite. |
| `npm run build` | Verifica os tipos TypeScript e gera a versão de produção em `dist/`. |
| `npm run preview` | Serve localmente a versão de produção já compilada. |
| `npm run lint` | Executa o Oxlint. |

Para validar a versão de produção:

```bash
npm run build
npm run preview
```

## Tecnologias

- React e TypeScript
- Vite
- [boardgame.io](https://boardgame.io/) para estado, turnos e regras da partida
- Oxlint

## Estrutura do projeto

- `src/game/`: regras, estado, dados de cartas e pontuação das combinações.
- `src/ui/`: telas e componentes da interface.
- `src/App.tsx`: menu, tabuleiro e integração do jogo com a interface.
- `public/cards/`: imagens das cartas de facções, objetivos e unidades militares.

## Observação

O modo multijogador implementado é **hotseat local**: os participantes jogam no mesmo dispositivo. O projeto não configura partidas online.
