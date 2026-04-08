/**
 * Shared pointer-event helpers for dnd-kit cross-container drag play function tests.
 *
 * dnd-kit's MouseSensor listens for native PointerEvents, so we dispatch them
 * directly rather than using userEvent.pointer() (which targets Playwright
 * element coordinates and doesn't exercise the sensor activation distance logic
 * the same way).
 */

/** Dispatch a PointerEvent at the given clientX/clientY coordinates. */
export function fire(
  target: Element,
  type: string,
  x: number,
  y: number,
  opts: Partial<PointerEventInit> = {},
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      ...opts,
    }),
  );
}

/** Get the centre point of an element's bounding rect. */
export function center(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Resolve after `ms` milliseconds. */
export const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Simulate a full drag sequence:
 *   1. pointerdown on `from`
 *   2. 6-pixel move to exceed the MouseSensor 5px activation distance
 *   3. Move through each `waypoints` element (letting collision detection run)
 *   4. pointerup at `dropTarget`
 */
export async function simulateDrag(
  from: Element,
  waypoints: Element[],
  dropTarget: Element,
): Promise<void> {
  const start = center(from);

  fire(from, "pointerdown", start.x, start.y);
  await delay(16);

  // Exceed activation distance
  fire(from, "pointermove", start.x, start.y + 6);
  await delay(50);

  for (const wp of waypoints) {
    const pt = center(wp);
    fire(document.documentElement, "pointermove", pt.x, pt.y);
    await delay(30);
  }

  const dropPt = center(dropTarget);
  fire(document.documentElement, "pointermove", dropPt.x, dropPt.y);
  await delay(30);

  fire(document.documentElement, "pointerup", dropPt.x, dropPt.y);
  await delay(50);
}

/**
 * Find the dnd-kit sortable wrapper for an item by its visible name text.
 *
 * Walks up from the `<p>` containing the exact name text to the nearest
 * ancestor that has a `tabindex` attribute (applied by `@dnd-kit/sortable`).
 */
export function getItemRow(
  canvasElement: Element,
  name: string,
): Element | null {
  for (const p of canvasElement.querySelectorAll("p")) {
    if (p.textContent === name) {
      let el: Element | null = p;
      while (el && !el.getAttribute("tabindex")) {
        el = el.parentElement;
      }
      return el;
    }
  }
  return null;
}

/**
 * Find the droppable folder card by the folder's visible name text.
 *
 * Walks up from the `<span>` containing the folder name to the nearest
 * ancestor with the `rounded-md` class (the folder card container).
 */
export function getFolderZone(
  canvasElement: Element,
  folderName: string,
): Element | null {
  for (const span of canvasElement.querySelectorAll("span")) {
    if (span.textContent?.trim() === folderName) {
      let el: Element | null = span;
      while (el && !el.classList.contains("rounded-md")) {
        el = el.parentElement;
      }
      return el;
    }
  }
  return null;
}
