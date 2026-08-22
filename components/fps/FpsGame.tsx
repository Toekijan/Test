"use client";

import { useEffect, useRef, useState } from "react";
import type { FpsEngine, HudState } from "@/lib/fps/engine";

const INITIAL_HUD: HudState = {
  health: 100,
  ammoInMag: 30,
  ammoReserve: 180,
  isReloading: false,
  enemiesAlive: 5,
  enemiesTotal: 5,
  hitmarker: 0,
  killfeed: [],
  gameOver: false,
  won: false,
};

export default function FpsGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FpsEngine | null>(null);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hitmarkerVisible, setHitmarkerVisible] = useState(false);
  const lastHitToken = useRef(0);

  useEffect(() => {
    let disposed = false;
    let engine: FpsEngine | null = null;

    (async () => {
      const { FpsEngine: Engine } = await import("@/lib/fps/engine");
      if (disposed || !containerRef.current) return;
      engine = new Engine(containerRef.current);
      engineRef.current = engine;
      engine.onHudUpdate((state) => setHud(state));
      engine.start();
    })();

    return () => {
      disposed = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onLockChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, []);

  useEffect(() => {
    if (hud.hitmarker !== lastHitToken.current) {
      lastHitToken.current = hud.hitmarker;
      setHitmarkerVisible(true);
      const timeout = setTimeout(() => setHitmarkerVisible(false), 160);
      return () => clearTimeout(timeout);
    }
  }, [hud.hitmarker]);

  const healthPct = Math.max(0, Math.min(100, hud.health));
  const ammoLow = hud.ammoInMag <= 5 && !hud.isReloading;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0, cursor: locked ? "none" : "pointer" }} />

      {/* Crosshair */}
      {locked && !hud.gameOver && (
        <div style={crosshairWrapStyle}>
          <div style={{ ...crossLineStyle, width: 2, height: 14, transform: "translate(-1px, -19px)" }} />
          <div style={{ ...crossLineStyle, width: 2, height: 14, transform: "translate(-1px, 5px)" }} />
          <div style={{ ...crossLineStyle, width: 14, height: 2, transform: "translate(-19px, -1px)" }} />
          <div style={{ ...crossLineStyle, width: 14, height: 2, transform: "translate(5px, -1px)" }} />
        </div>
      )}

      {/* Hitmarker */}
      {hitmarkerVisible && (
        <div style={crosshairWrapStyle}>
          <div style={{ ...hitmarkStyle, transform: "translate(-14px,-14px) rotate(45deg)" }} />
          <div style={{ ...hitmarkStyle, transform: "translate(6px,-14px) rotate(-45deg)" }} />
          <div style={{ ...hitmarkStyle, transform: "translate(-14px,6px) rotate(-45deg)" }} />
          <div style={{ ...hitmarkStyle, transform: "translate(6px,6px) rotate(45deg)" }} />
        </div>
      )}

      {/* HUD bottom-left: health */}
      {locked && !hud.gameOver && (
        <div style={{ position: "absolute", left: 28, bottom: 28, color: "#fff", userSelect: "none" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.75, marginBottom: 4 }}>HEALTH</div>
          <div style={{ width: 220, height: 14, background: "rgba(0,0,0,0.45)", borderRadius: 3, overflow: "hidden", border: "1px solid rgba(255,255,255,0.15)" }}>
            <div
              style={{
                width: `${healthPct}%`,
                height: "100%",
                background: healthPct < 30 ? "linear-gradient(90deg,#c62828,#ff5252)" : "linear-gradient(90deg,#3a7d2c,#7fd65a)",
                transition: "width 0.2s ease-out",
              }}
            />
          </div>
        </div>
      )}

      {/* HUD bottom-right: ammo */}
      {locked && !hud.gameOver && (
        <div style={{ position: "absolute", right: 28, bottom: 28, color: "#fff", textAlign: "right", userSelect: "none" }}>
          <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, color: ammoLow ? "#ff5252" : "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.7)" }}>
            {hud.isReloading ? "..." : hud.ammoInMag}
            <span style={{ fontSize: 18, opacity: 0.6, marginLeft: 6 }}>/ {hud.ammoReserve}</span>
          </div>
          <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.6, marginTop: 2 }}>{hud.isReloading ? "RELOADING" : "AR-15 VANGUARD"}</div>
        </div>
      )}

      {/* Enemies remaining */}
      {locked && !hud.gameOver && (
        <div style={{ position: "absolute", top: 24, right: 28, color: "#fff", textAlign: "right", userSelect: "none" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.7 }}>HOSTILES</div>
          <div style={{ fontSize: 28, fontWeight: 700, textShadow: "0 2px 8px rgba(0,0,0,0.7)" }}>
            {hud.enemiesAlive} <span style={{ fontSize: 16, opacity: 0.55 }}>/ {hud.enemiesTotal}</span>
          </div>
        </div>
      )}

      {/* Killfeed */}
      {locked && !hud.gameOver && (
        <div style={{ position: "absolute", top: 24, left: 28, color: "#fff", userSelect: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {hud.killfeed.map((k, i) => (
            <div
              key={i}
              style={{
                fontSize: 13,
                letterSpacing: 0.5,
                background: "rgba(0,0,0,0.4)",
                padding: "4px 10px",
                borderLeft: "3px solid #ff5252",
                opacity: 1 - i * 0.2,
              }}
            >
              {k}
            </div>
          ))}
        </div>
      )}

      {/* Start / pause overlay */}
      {!locked && !hud.gameOver && (
        <div style={overlayStyle}>
          <h1 style={{ fontSize: 42, margin: 0, letterSpacing: 4, textShadow: "0 4px 24px rgba(255,80,20,0.5)" }}>VANGUARD PROTOCOL</h1>
          <p style={{ opacity: 0.75, marginTop: 8, marginBottom: 28, fontSize: 14, letterSpacing: 1 }}>
            {started ? "PAUSED — click to resume" : "Click to enter combat"}
          </p>
          <div style={{ fontSize: 13, opacity: 0.65, lineHeight: 1.9, letterSpacing: 0.5 }}>
            <div>WASD — Move&nbsp;&nbsp;&nbsp; SHIFT — Sprint&nbsp;&nbsp;&nbsp; CTRL — Crouch&nbsp;&nbsp;&nbsp; SPACE — Jump</div>
            <div>Left Click — Fire&nbsp;&nbsp;&nbsp; Right Click — Aim&nbsp;&nbsp;&nbsp; R — Reload</div>
          </div>
          <button
            onClick={() => {
              setStarted(true);
              containerRef.current?.querySelector("canvas")?.dispatchEvent(new MouseEvent("click"));
            }}
            style={playButtonStyle}
          >
            {started ? "RESUME" : "ENTER ARENA"}
          </button>
        </div>
      )}

      {/* Game over / win overlay */}
      {hud.gameOver && (
        <div style={overlayStyle}>
          <h1
            style={{
              fontSize: 48,
              margin: 0,
              letterSpacing: 4,
              color: hud.won ? "#7fd65a" : "#ff5252",
              textShadow: hud.won ? "0 4px 24px rgba(80,220,80,0.5)" : "0 4px 24px rgba(255,40,40,0.6)",
            }}
          >
            {hud.won ? "ARENA CLEARED" : "KIA"}
          </h1>
          <p style={{ opacity: 0.75, margin: "12px 0 28px", fontSize: 14, letterSpacing: 1 }}>
            {hud.won ? "All hostiles eliminated." : "You were eliminated."}
          </p>
          <button onClick={() => window.location.reload()} style={playButtonStyle}>
            RESTART
          </button>
        </div>
      )}
    </div>
  );
}

const crosshairWrapStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  width: 0,
  height: 0,
  pointerEvents: "none",
};

const crossLineStyle: React.CSSProperties = {
  position: "absolute",
  background: "rgba(255,255,255,0.85)",
  boxShadow: "0 0 3px rgba(0,0,0,0.8)",
};

const hitmarkStyle: React.CSSProperties = {
  position: "absolute",
  width: 3,
  height: 14,
  background: "#ffdd55",
  boxShadow: "0 0 4px rgba(255,200,50,0.9)",
};

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  background: "radial-gradient(ellipse at center, rgba(20,15,10,0.55) 0%, rgba(5,5,8,0.92) 75%)",
  textAlign: "center",
  userSelect: "none",
};

const playButtonStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "14px 42px",
  fontSize: 16,
  letterSpacing: 3,
  fontWeight: 700,
  color: "#0a0a0a",
  background: "linear-gradient(180deg,#ffcf5c,#e8a020)",
  border: "none",
  borderRadius: 2,
  cursor: "pointer",
  boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
};
