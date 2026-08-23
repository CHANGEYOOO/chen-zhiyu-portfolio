import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./StrokeText.css";

const { gsap, ScrollTrigger } = window;
gsap?.registerPlugin(ScrollTrigger);

export default function StrokeText({
  text,
  strokeColor,
  fillColor,
  trigger = "scroll",
  className = "",
}) {
  const rootRef = useRef(null);
  const outlineRef = useRef(null);
  const wipeRef = useRef(null);
  const [box, setBox] = useState(null);
  const wipeId = `stroke-wipe-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const characters = useMemo(() => Array.from(text), [text]);
  const fontSize = 160;
  const dash = fontSize * 7;

  useLayoutEffect(() => {
    const outline = outlineRef.current;
    if (!outline) return undefined;
    const measure = () => {
      const bounds = outline.getBBox();
      const pad = 8;
      setBox({ x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + pad * 2, height: bounds.height + pad * 2 });
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    return undefined;
  }, [characters]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !box) return undefined;
    const strokes = gsap.utils.toArray(root.querySelectorAll("[data-stroke-char]"));
    const wipe = wipeRef.current;
    const targets = [...strokes, wipe].filter(Boolean);
    const finish = () => {
      gsap.set(strokes, { strokeDasharray: dash, strokeDashoffset: 0 });
      gsap.set(wipe, { attr: { width: box.width } });
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return () => gsap.killTweensOf(targets);
    }
    gsap.set(strokes, { strokeDasharray: dash, strokeDashoffset: dash });
    gsap.set(wipe, { attr: { width: 0 } });
    const timeline = gsap.timeline({ paused: trigger === "scroll" });
    timeline
      .to(strokes, { strokeDashoffset: 0, duration: 0.72, ease: "power2.out", stagger: 0.035 })
      .to(wipe, { attr: { width: box.width }, duration: 0.38, ease: "power2.inOut" }, "+=0.08");
    const scrollTrigger = trigger === "scroll"
      ? ScrollTrigger.create({ trigger: root, start: "top 84%", once: true, onEnter: () => timeline.play(0) })
      : null;
    if (!scrollTrigger) timeline.play(0);
    return () => {
      scrollTrigger?.kill();
      timeline.kill();
      gsap.killTweensOf(targets);
    };
  }, [box, dash, trigger]);

  const viewBox = box ? `${box.x} ${box.y} ${box.width} ${box.height}` : "0 -160 800 208";
  return (
    <span ref={rootRef} className={`stroke-text ${className}`.trim()} role="img" aria-label={text}>
      <svg className="stroke-text__svg" viewBox={viewBox} preserveAspectRatio="xMinYMid meet" aria-hidden="true">
        {box && <defs><clipPath id={wipeId} clipPathUnits="userSpaceOnUse"><rect ref={wipeRef} x={box.x} y={box.y} width="0" height={box.height} /></clipPath></defs>}
        <text ref={outlineRef} className="stroke-text__outline" x="0" y="0" fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinejoin="round" style={{ fontFamily: "inherit", fontSize, fontWeight: 400, letterSpacing: "-7px" }}>
          {characters.map((character, index) => <tspan data-stroke-char key={`stroke-${index}`}>{character}</tspan>)}
        </text>
        <text x="0" y="0" fill={fillColor} clipPath={box ? `url(#${wipeId})` : undefined} style={{ fontFamily: "inherit", fontSize, fontWeight: 400, letterSpacing: "-7px" }}>
          {characters.map((character, index) => <tspan key={`fill-${index}`}>{character}</tspan>)}
        </text>
      </svg>
    </span>
  );
}
