import type { en } from "./en";
export type Dict = typeof en;
/** A locale file may be partial while it is being translated; missing keys fall back to EN at runtime and fail the
 * vitest coverage guard (tests/i18n.test.ts). Arrays are replaced whole (same length as EN, checked by the guard). */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };
