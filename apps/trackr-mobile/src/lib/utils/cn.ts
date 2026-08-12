import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class strings, resolving conflicts so a later class wins
 * (incl. Tailwind v4 arbitrary-property utilities like `bg-(--color-x)`).
 * The single composition primitive for the `ui/` component kit.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
