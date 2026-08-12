/**
 * Reactive visual-viewport tracker. `dvh` ignores the on-screen keyboard on
 * iOS, so full-height layouts get panned when it opens; sizing them with
 * `viewport.height` instead lets them shrink and re-center — once the
 * document fits the visible area there is nothing left to pan. On Android
 * the `interactive-widget=resizes-content` viewport flag makes the layout
 * resize natively and the inset stays 0.
 */
class Viewport {
  /** Visible height in px; 0 until the first measurement (fall back to 100dvh). */
  height = $state(0);
  /** Height covered by the keyboard (+ accessory bar) in px. */
  keyboardInset = $state(0);
  /** How far iOS has panned the visual viewport down the layout viewport. */
  offsetTop = $state(0);

  constructor() {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      this.height = vv.height;
      this.offsetTop = vv.offsetTop;
      this.keyboardInset = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
    };
    update();
    // app-lifetime singleton — listeners are never removed on purpose
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
  }

  get keyboardOpen(): boolean {
    return this.keyboardInset > 60;
  }
}

export const viewport = new Viewport();
