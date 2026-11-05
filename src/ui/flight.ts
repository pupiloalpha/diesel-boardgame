/**
 * Voo de cartas: cria uma imagem "fantasma" fixa na tela e a anima da origem
 * até o destino (Web Animations API). Não depende do estado do React, então
 * funciona mesmo quando o turno passa para outro jogador logo em seguida.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/** Caixa do elemento ignorando rotação/zoom (usa o tamanho de layout, centrado onde ele está). */
export function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  const w = el instanceof HTMLElement ? el.offsetWidth || r.width : r.width;
  const h = el instanceof HTMLElement ? el.offsetHeight || r.height : r.height;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
}

/** Lê uma variável CSS da paleta (App.css), com valor de reserva. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

interface FlyOptions {
  src: string;
  from: Box;
  to: Box;
  /** Troca a imagem no meio do voo (ex.: frente → verso quando a carta fica oculta). */
  swapTo?: string;
  duration?: number;
  delay?: number;
}

export function flyCard({
  src, from, to, swapTo, duration = 650, delay = 0,
}: FlyOptions): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();

  if (swapTo) new Image().src = swapTo; // pré-carrega

  const brass = cssVar('--brass', '#b5ab90');
  const glow = cssVar('--amber-rgb', '242, 163, 58');

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  Object.assign(img.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    objectFit: 'cover',
    borderRadius: '6px',
    border: `2px solid ${brass}`,
    boxShadow: `0 12px 30px rgba(0,0,0,.7), 0 0 20px rgba(${glow}, .55)`,
    zIndex: '400',
    pointerEvents: 'none',
    willChange: 'transform',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(img);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = to.width / from.width;
  const lift = Math.min(90, Math.hypot(dx, dy) * 0.25);

  const animation = img.animate(
    [
      { transform: 'translate(0px, 0px) scale(1) rotate(0deg)' },
      {
        transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(${((1 + scale) / 2) * 1.1}) rotate(-6deg)`,
        offset: 0.5,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)` },
    ],
    { duration, delay, easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)', fill: 'both' },
  );

  const swapTimer = swapTo
    ? window.setTimeout(() => { img.src = swapTo; }, delay + duration * 0.45)
    : undefined;

  return new Promise((resolve) => {
    const end = () => {
      if (swapTimer) window.clearTimeout(swapTimer);
      img.remove();
      resolve();
    };
    animation.onfinish = end;
    animation.oncancel = end;
  });
}
