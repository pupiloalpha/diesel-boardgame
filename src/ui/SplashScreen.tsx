import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './flight';
import './splash.css';

/**
 * Abertura do site: exibe a arte da caixa do jogo com animação de entrada,
 * aguarda alguns segundos (ou um clique / tecla) e sai com animação,
 * revelando o menu principal que já está renderizado por baixo.
 *
 * A imagem fica em  public/caixa-do-jogo.jpg
 */

const BOX_IMAGE = `${import.meta.env.BASE_URL}caixa-do-jogo.jpg`;

/** Tempo na tela, contado a partir do carregamento da imagem. */
const HOLD_MS = 4200;
/** Duração da animação de saída (deve acompanhar splashOut em splash.css). */
const EXIT_MS = 1000;
/** Versões curtas para quem prefere movimento reduzido. */
const HOLD_MS_REDUCED = 1800;
const EXIT_MS_REDUCED = 250;

interface Props {
  /** Disparado quando a saída começa (use para revelar o menu por baixo). */
  onLeaving: () => void;
  /** Disparado quando a abertura terminou e pode ser desmontada. */
  onDone: () => void;
}

export default function SplashScreen({ onLeaving, onDone }: Props) {
  const [reduced] = useState(prefersReducedMotion);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const onLeavingRef = useRef(onLeaving);
  const onDoneRef = useRef(onDone);
  onLeavingRef.current = onLeaving;
  onDoneRef.current = onDone;

  const leave = useCallback(() => setLeaving(true), []);

  // Imagem em cache pode já estar completa antes do onLoad ser registrado.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  // Saída automática depois de um tempo na tela.
  useEffect(() => {
    if (!loaded || leaving) return;
    const t = window.setTimeout(leave, reduced ? HOLD_MS_REDUCED : HOLD_MS);
    return () => window.clearTimeout(t);
  }, [loaded, leaving, leave, reduced]);

  // Qualquer tecla também avança.
  useEffect(() => {
    const onKey = () => leave();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leave]);

  // Saída: avisa o App e, ao final da animação, encerra.
  useEffect(() => {
    if (!leaving) return;
    onLeavingRef.current();
    const t = window.setTimeout(
      () => onDoneRef.current(),
      reduced ? EXIT_MS_REDUCED : EXIT_MS,
    );
    return () => window.clearTimeout(t);
  }, [leaving, reduced]);

  // Se a imagem não existir, não trava o jogo: vai direto ao menu.
  useEffect(() => {
    if (!failed) return;
    onLeavingRef.current();
    onDoneRef.current();
  }, [failed]);

  const cls = ['splash', loaded ? 'is-loaded' : '', leaving ? 'is-leaving' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      role="dialog"
      aria-modal="true"
      aria-label="Abertura de D.I.E.S.E.L."
      onClick={leave}
    >
      <div className="splash-stage">
        <div className="splash-frame">
          <img
            ref={imgRef}
            src={BOX_IMAGE}
            alt="Caixa do jogo D.I.E.S.E.L.: O futuro não será limpo. Será forjado."
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </div>

        <div className="splash-actions">
          <button
            className="splash-btn"
            onClick={(e) => {
              e.stopPropagation();
              leave();
            }}
            autoFocus
          >
            Entrar
          </button>
          <p className="splash-hint">ou toque na tela / pressione qualquer tecla</p>
        </div>
      </div>
    </div>
  );
}
