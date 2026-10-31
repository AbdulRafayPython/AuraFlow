// Pure helpers behind the global keyboard shortcuts.

/** True when the keyboard event started in something the user is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return !!el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Next / previous channel id in `ids`, wrapping; null when there is nothing to move to. */
export function adjacentChannel(ids: number[], currentId: number | undefined, step: 1 | -1): number | null {
  if (ids.length === 0) return null;
  const i = currentId == null ? -1 : ids.indexOf(currentId);
  if (i === -1) return step === 1 ? ids[0] : ids[ids.length - 1];
  return ids[(i + step + ids.length) % ids.length];
}
