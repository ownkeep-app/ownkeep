/**
 * Move the item `activeId` to where `overId` is: after it when moving forward, before it when moving
 * back, so it lands exactly on the slot it was dropped on. Unknown ids leave the order unchanged.
 */
export function moveItem<T extends { id: string }>(
  items: readonly T[],
  activeId: string,
  overId: string,
): T[] {
  const from = items.findIndex((item) => item.id === activeId);
  const to = items.findIndex((item) => item.id === overId);
  if (from < 0 || to < 0) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
