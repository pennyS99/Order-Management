"use client";

import React from "react";
import "./GlitchText.css";

interface GlitchTextProps {
  children: React.ReactNode;
  speed?: number;
  enableShadows?: boolean;
  enableOnHover?: boolean;
  className?: string;
}

const GlitchText = ({
  children,
  speed = 1,
  enableShadows = true,
  enableOnHover = true,
  className = "",
}: GlitchTextProps) => {
  const textContent =
    typeof children === "string"
      ? children
      : React.Children.toArray(children).join("");

  const inlineStyles = {
    "--after-duration": `${speed * 3}s`,
    "--before-duration": `${speed * 2}s`,
    "--after-shadow": enableShadows ? "-5px 0 red" : "none",
    "--before-shadow": enableShadows ? "5px 0 cyan" : "none",
  } as React.CSSProperties;

  const hoverClass = enableOnHover ? "enable-on-hover" : "";

  return (
    <span
      className={`glitch ${hoverClass} ${className}`.trim()}
      data-text={textContent}
      style={inlineStyles}
    >
      {children}
    </span>
  );
};

export default GlitchText;
