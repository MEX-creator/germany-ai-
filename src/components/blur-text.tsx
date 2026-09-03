"use client";

import React, { useEffect, useRef, useState } from "react";

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "characters";
}

export function BlurText({
  text,
  delay = 0,
  className = "",
  animateBy = "words",
}: BlurTextProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const items = animateBy === "words" ? text.split(" ") : text.split("");

  return (
    <div ref={ref} className={`inline-flex flex-wrap ${className}`} aria-label={text}>
      {items.map((item, i) => (
        <span
          key={i}
          className="inline-block transition-all duration-700 ease-out"
          style={{
            transitionDelay: `${delay + i * (animateBy === "words" ? 80 : 30)}ms`,
            opacity: visible ? 1 : 0,
            filter: visible ? "blur(0px)" : "blur(8px)",
            transform: visible ? "translateY(0)" : "translateY(4px)",
          }}
        >
          {item}
          {animateBy === "words" && i < items.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </div>
  );
}
