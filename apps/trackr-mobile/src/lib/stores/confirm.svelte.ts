export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel: string;
  /** Destructive styling on the confirm button. */
  danger?: boolean;
};

/**
 * Imperative confirmation flow rendered as a ConfirmSheet (mounted in the
 * root layout). Replaces native `confirm()` so destructive prompts stay in
 * the app's own design language:
 *
 *   if (!(await confirmSheet.show({ message, confirmLabel }))) return;
 */
class ConfirmStore {
  open = $state(false);
  options = $state<ConfirmOptions>({ message: "", confirmLabel: "" });

  #resolve: ((value: boolean) => void) | null = null;

  show(options: ConfirmOptions): Promise<boolean> {
    this.#resolve?.(false); // a new prompt supersedes a pending one
    this.options = options;
    this.open = true;
    return new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  settle(value: boolean): void {
    this.open = false;
    this.#resolve?.(value);
    this.#resolve = null;
  }
}

export const confirmSheet = new ConfirmStore();
