import { useEffect, useMemo, useRef } from "react";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (from, to, amount) => from + (to - from) * amount;

export default function CircularGallery({ items = [], label, bend = 3, scrollSpeed = 1.5, scrollEase = 0.06 }) {
  const rootRef = useRef(null);
  const cardsRef = useRef([]);
  const data = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  // Small projects need more runtime copies so the loop is covered before any drag begins.
  const copyCount = data.length <= 4 ? 8 : 3;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !data.length) return undefined;

    const cards = cardsRef.current.filter(Boolean);
    const count = data.length;
    const state = { current: 0, target: 0, raf: 0, snapTimer: 0 };
    let positions = [];
    let cardWidths = [];
    let totalWidth = 0;
    let viewportWidth = 0;
    let firstWidth = 0;
    let gap = 28;
    let initialized = false;

    const measure = () => {
      viewportWidth = root.clientWidth;
      gap = Number.parseFloat(getComputedStyle(root).getPropertyValue("--react-gallery-gap")) || 28;
      positions = [];
      cardWidths = [];
      let cursor = 0;
      cards.forEach((card) => {
        const cardWidth = card.offsetWidth;
        cardWidths.push(cardWidth);
        positions.push(cursor);
        cursor += cardWidth + gap;
      });
      firstWidth = cardWidths[0] || 0;
      totalWidth = cursor;
      const sourceWidth = positions[count] || totalWidth;
      if (!initialized && sourceWidth > 0) {
        state.current = cardCenterOffset(count * Math.floor(copyCount / 2));
        state.target = state.current;
        initialized = true;
      }
    };

    const canScroll = () => totalWidth > viewportWidth;

    const cardCenterOffset = (index) => {
      const width = cardWidths[index] || firstWidth;
      return positions[index] + (width - firstWidth) / 2;
    };

    const render = () => {
      state.current = lerp(state.current, state.target, scrollEase);
      const centerOffset = (viewportWidth - firstWidth) / 2;
      const halfViewport = Math.max(1, viewportWidth / 2);

      cards.forEach((card, index) => {
        const cardWidth = cardWidths[index] || firstWidth;
        let x = centerOffset + positions[index] - state.current;
        while (x + cardWidth < -totalWidth / 2) x += totalWidth;
        while (x > viewportWidth + totalWidth / 2) x -= totalWidth;
        const distance = x + cardWidth / 2 - viewportWidth / 2;
        const normalized = clamp(distance / halfViewport, -1, 1);
        const curve = bend * 16 * normalized * normalized;
        const rotation = normalized * bend * 3;
        const focus = clamp(1 - Math.abs(normalized) / 0.72, 0, 1);
        const depthProgress = clamp(Math.abs(normalized), 0, 1);
        const depthCurve = Math.pow(1 - depthProgress, 2.4);
        const scale = lerp(0.84, 1.09, depthCurve);
        const depthZ = lerp(0, -160, depthProgress);
        const lift = focus * 34;
        card.style.transform = `translate3d(${x.toFixed(2)}px, ${(curve - lift).toFixed(2)}px, ${depthZ.toFixed(2)}px) rotateZ(${rotation.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        card.style.setProperty("--react-card-depth-blur", (1 - depthCurve).toFixed(3));
        card.style.opacity = String(lerp(0.72, 1, depthCurve));
        card.style.zIndex = String(1000 - Math.round(Math.abs(normalized) * 100));
      });

      state.raf = window.requestAnimationFrame(render);
    };

    const snap = () => {
      const cycleWidth = positions[count] || totalWidth;
      if (!cycleWidth) return;
      let nearestTarget = state.target;
      let nearestDistance = Infinity;
      cards.forEach((card, index) => {
        const anchor = cardCenterOffset(index);
        const cycleIndex = Math.round((state.target - anchor) / cycleWidth);
        for (const offset of [-1, 0, 1]) {
          const candidate = anchor + (cycleIndex + offset) * cycleWidth;
          const distance = Math.abs(candidate - state.target);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestTarget = candidate;
          }
        }
      });
      state.target = nearestTarget;
    };

    const onWheel = (event) => {
      const deltaX = event.deltaX;
      if (!canScroll() || Math.abs(deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      state.target += clamp(deltaX, -100, 100) * scrollSpeed * 0.8;
      window.clearTimeout(state.snapTimer);
      state.snapTimer = window.setTimeout(snap, 180);
    };

    const onPointerDown = (event) => {
      if (!canScroll()) return;
      root.setPointerCapture?.(event.pointerId);
      root.dataset.dragging = "true";
      root.dragState = { start: event.clientX, target: state.target };
    };

    const onPointerMove = (event) => {
      if (root.dragState) state.target = root.dragState.target + (root.dragState.start - event.clientX) * scrollSpeed;
    };

    const onPointerUp = () => {
      root.dragState = null;
      delete root.dataset.dragging;
      snap();
    };

    const onKeyDown = (event) => {
      if (!canScroll()) return;
      const step = (cards[0]?.getBoundingClientRect().width || 240) + gap;
      if (event.key === "ArrowRight") state.target += step;
      if (event.key === "ArrowLeft") state.target -= step;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        snap();
      }
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(root);
    cards.forEach((card) => card.querySelector("img")?.addEventListener("load", measure, { once: true }));
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerUp);
    root.addEventListener("keydown", onKeyDown);
    measure();
    state.raf = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(state.raf);
      window.clearTimeout(state.snapTimer);
      resizeObserver.disconnect();
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [bend, data, scrollEase, scrollSpeed]);

  const galleryItems = Array.from({ length: copyCount }, () => data).flat();

  return (
    <div ref={rootRef} className="circular-gallery react-circular-gallery" tabIndex={0} role="region" aria-label={label}>
      <div className="react-circular-gallery-track">
        {galleryItems.map((item, index) => (
          <button
            key={`${item.image}-${index}`}
            ref={(element) => { cardsRef.current[index] = element; }}
            className="react-circular-gallery-card"
            style={{ "--react-card-ratio": item.aspectRatio || 1 }}
            type="button"
            aria-hidden={index >= data.length ? "true" : undefined}
            tabIndex={index >= data.length ? -1 : 0}
            aria-label={`${label}第 ${index % data.length + 1} 张图片`}
          >
            <img src={item.image} alt={item.alt || ""} width={item.dimensions?.[0]} height={item.dimensions?.[1]} draggable="false" decoding="async" loading={data.length <= 4 || index < 2 ? "eager" : "lazy"} />
          </button>
        ))}
      </div>
    </div>
  );
}
