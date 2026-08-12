export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

class ToastStore {
  items = $state<ToastItem[]>([]);
  #nextId = 0;

  show(kind: ToastKind, message: string, durationMs = 3000): void {
    const id = ++this.#nextId;
    this.items = [...this.items, { id, kind, message }];
    setTimeout(() => this.dismiss(id), durationMs);
  }

  success(message: string): void {
    this.show("success", message);
  }

  error(message: string): void {
    this.show("error", message, 4500);
  }

  info(message: string): void {
    this.show("info", message);
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toast = new ToastStore();
