import { createElement, useEffect, useMemo, useRef, useState } from "react";
import "./TextType.css";

export default function TextType({
  text,
  as: Component = "span",
  className = "",
  typingSpeed = 26,
  initialDelay = 0,
  startOnVisible = true,
  showCursor = true,
}) {
  const rootRef = useRef(null);
  const characters = useMemo(() => Array.from(text), [text]);
  const [visible, setVisible] = useState(!startOnVisible);
  const [count, setCount] = useState(0);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const root = rootRef.current;
    if (!startOnVisible || !root || reducedMotion || !("IntersectionObserver" in window)) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setCount(0);
    }, { threshold: 0.12 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [reducedMotion, startOnVisible]);

  useEffect(() => {
    if (!visible) return undefined;
    if (reducedMotion) {
      setCount(characters.length);
      return undefined;
    }
    if (count >= characters.length) return undefined;
    const delay = count === 0 ? initialDelay : typingSpeed;
    const timeout = window.setTimeout(() => setCount((value) => value + 1), delay);
    return () => window.clearTimeout(timeout);
  }, [characters.length, count, initialDelay, reducedMotion, typingSpeed, visible]);

  const complete = count >= characters.length;
  return createElement(
    Component,
    { ref: rootRef, className: `text-type ${className}`.trim(), "aria-label": text },
    <span className="text-type__content" aria-hidden="true">{characters.slice(0, count).join("")}</span>,
    showCursor && !complete && <span className="text-type__cursor" aria-hidden="true">|</span>,
  );
}
