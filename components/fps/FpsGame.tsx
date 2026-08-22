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

const ACCENT = "#e8a020";
const ACCENT_BRIGHT = "#ffcf5c";
const DANGER = "#ff4d3d";
const CUT = "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)";
const FONT = "'Bahnschrift', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";

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
  const healthLow = healthPct < 30;
  const ammoLow = hud.ammoInMag <= 5 && !hud.isReloading;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", fontFamily: FONT }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0, cursor: locked ? "none" : "pointer" }} />

      {/* Corner tick frame — subtle tactical viewport dressing */}
      {locked && !hud.gameOver && (
        <>
          {(["tl", "tr", "bl", "br"] as const).map((corner) => (
            <div key={corner} style={cornerTickStyle(corner)} />
          ))}
        </>
      )}

      {/* Crosshair */}
      {locked && !hud.gameOver && (
        <div style={crosshairWrapStyle}>
          <div style={{ ...crossLineStyle, width: 2, height: 13, transform: "translate(-1px, -18px)" }} />
          <div style={{ ...crossLineStyle, width: 2, height: 13, transform: "translate(-1px, 5px)" }} />
          <div style={{ ...crossLineStyle, width: 13, height: 2, transform: "translate(-18px, -1px)" }} />
          <div style={{ ...crossLineStyle, width: 13, height: 2, transform: "translate(5px, -1px)" }} />
          <div style={{ position: "absolute", width: 3, height: 3, borderRadius: "50%", background: ACCENT_BRIGHT, transform: "translate(-1.5px,-1.5px)" }} />
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
        <div style={{ position: "absolute", left: 26, bottom: 26, userSelect: "none" }}>
          <div style={hudChipStyle}>
            <div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.7, color: "#fff", marginBottom: 6, fontWeight: 700 }}>INTEGRITY</div>
            <div style={{ width: 210, height: 12, background: "rgba(0,0,0,0.55)", clipPath: CUT, overflow: "hidden", border: `1px solid ${healthLow ? DANGER : "rgba(232,160,32,0.4)"}` }}>
              <div
                style={{
                  width: `${healthPct}%`,
                  height: "100%",
                  background: healthLow ? `linear-gradient(90deg,#8a1c1c,${DANGER})` : `linear-gradient(90deg,#8a5a10,${ACCENT_BRIGHT})`,
                  transition: "width 0.2s ease-out",
                  boxShadow: healthLow ? `0 0 8px ${DANGER}` : `0 0 6px ${ACCENT}`,
                }}
              />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: healthLow ? DANGER : "#fff", marginTop: 4, letterSpacing: 1 }}>
              {Math.round(healthPct)}
            </div>
          </div>
        </div>
      )}

      {/* HUD bottom-right: ammo */}
      {locked && !hud.gameOver && (
        <div style={{ position: "absolute", right: 26, bottom: 26, textAlign: "right", userSelect: "none" }}>
          <div style={{ ...hudChipStyle, textAlign: "right" }}>
            <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, color: ammoLow ? DANGER : "#fff", letterSpacing: 1 }}>
              {hud.isReloading ? "—" : hud.ammoInMag}
              <span style={{ fontSize: 17, opacity: 0.55, marginLeft: 6, color: "#fff" }}>/ {hud.ammoReserve}</span>
            </div>
            <div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.75, marginTop: 2, color: ACCENT_BRIGHT, fontWeight: 700 }}>
              {hud.isReloading ? "RELOADING" : "AR-15 VANGUARD"}
            </div>
          </div>
        </div>
      )}

      {/* Enemies remaining */}
      {locked && !hud.gameOver && (
        <div style={{ position: "absolute", top: 22, right: 26, textAlign: "right", userSelect: "none" }}>
          <div style={hudChipStyle}>
            <div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.7, color: "#fff", fontWeight: 700 }}>HOSTILES</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: 1 }}>
              {hud.enemiesAlive} <span style={{ fontSize: 15, opacity: 0.5 }}>/ {hud.enemiesTotal}</span>
            </div>
          </div>
        </div>
      )}

      {/* Killfeed */}
      {locked && !hud.gameOver && (
        <div style={{ position: "absolute", top: 22, left: 26, userSelect: "none", display: "flex", flexDirection: "column", gap: 5 }}>
          {hud.killfeed.map((k, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                color: "#fff",
                background: "rgba(10,8,6,0.72)",
                padding: "5px 12px",
                borderLeft: `3px solid ${DANGER}`,
                clipPath: "polygon(0 0, 100% 0, 100% 100%, 6px 100%, 0 calc(100% - 6px))",
                opacity: 1 - i * 0.18,
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
          <div style={{ fontSize: 12, letterSpacing: 8, color: ACCENT, marginBottom: 10, fontWeight: 700 }}>TACTICAL COMBAT SIMULATION</div>
          <h1 style={{ fontSize: 46, margin: 0, letterSpacing: 6, fontWeight: 700, textShadow: `0 4px 28px rgba(232,160,32,0.45)`, color: "#fff" }}>
            VANGUARD PROTOCOL
          </h1>
          <div style={{ width: 120, height: 2, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, margin: "18px 0" }} />
          <p style={{ opacity: 0.8, marginTop: 0, marginBottom: 26, fontSize: 13, letterSpacing: 2, color: "#fff" }}>
            {started ? "SIMULATION PAUSED — CLICK TO RESUME" : "CLICK TO ENTER THE ARENA"}
          </p>
          <div
            style={{
              fontSize: 12,
              opacity: 0.9,
              lineHeight: 2.2,
              letterSpacing: 1,
              color: "#fff",
              background: "rgba(8,6,4,0.55)",
              border: "1px solid rgba(232,160,32,0.2)",
              padding: "12px 20px",
            }}
          >
            <div>
              <kbd style={keyStyle}>WASD</kbd> Move &nbsp; <kbd style={keyStyle}>SHIFT</kbd> Sprint &nbsp; <kbd style={keyStyle}>CTRL</kbd> Crouch &nbsp;{" "}
              <kbd style={keyStyle}>SPACE</kbd> Jump
            </div>
            <div>
              <kbd style={keyStyle}>LMB</kbd> Fire &nbsp; <kbd style={keyStyle}>RMB</kbd> Aim &nbsp; <kbd style={keyStyle}>R</kbd> Reload
            </div>
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
              fontSize: 50,
              margin: 0,
              letterSpacing: 6,
              fontWeight: 700,
              color: hud.won ? ACCENT_BRIGHT : DANGER,
              textShadow: hud.won ? `0 4px 28px rgba(232,160,32,0.5)` : `0 4px 28px rgba(255,60,50,0.55)`,
            }}
          >
            {hud.won ? "ARENA CLEARED" : "KIA"}
          </h1>
          <div style={{ width: 120, height: 2, background: `linear-gradient(90deg, transparent, ${hud.won ? ACCENT : DANGER}, transparent)`, margin: "18px 0" }} />
          <p style={{ opacity: 0.8, margin: "0 0 28px", fontSize: 13, letterSpacing: 2, color: "#fff" }}>
            {hud.won ? "ALL HOSTILES ELIMINATED" : "YOU WERE ELIMINATED"}
          </p>
          <button onClick={() => window.location.reload()} style={playButtonStyle}>
            RESTART
          </button>
        </div>
      )}
    </div>
  );
}

function cornerTickStyle(corner: "tl" | "tr" | "bl" | "br"): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: "rgba(232,160,32,0.55)",
    pointerEvents: "none",
  };
  const offset = 14;
  switch (corner) {
    case "tl":
      return { ...base, top: offset, left: offset, borderTop: "2px solid", borderLeft: "2px solid" };
    case "tr":
      return { ...base, top: offset, right: offset, borderTop: "2px solid", borderRight: "2px solid" };
    case "bl":
      return { ...base, bottom: offset, left: offset, borderBottom: "2px solid", borderLeft: "2px solid" };
    case "br":
      return { ...base, bottom: offset, right: offset, borderBottom: "2px solid", borderRight: "2px solid" };
  }
}

const hudChipStyle: React.CSSProperties = {
  background: "rgba(10,8,6,0.6)",
  border: "1px solid rgba(232,160,32,0.25)",
  clipPath: CUT,
  padding: "10px 16px",
};

const keyStyle: React.CSSProperties = {
  display: "inline-block",
  fontFamily: FONT,
  fontWeight: 700,
  fontSize: 11,
  padding: "3px 7px",
  borderRadius: 3,
  border: `1px solid rgba(255,210,120,0.6)`,
  borderBottom: `3px solid rgba(150,95,10,0.9)`,
  color: "#1a1206",
  background: `linear-gradient(180deg, ${ACCENT_BRIGHT}, ${ACCENT})`,
  boxShadow: "0 1px 0 rgba(0,0,0,0.4)",
  letterSpacing: 0.5,
};

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
  background: "rgba(255,255,255,0.9)",
  boxShadow: "0 0 3px rgba(0,0,0,0.9)",
};

const hitmarkStyle: React.CSSProperties = {
  position: "absolute",
  width: 3,
  height: 14,
  background: ACCENT_BRIGHT,
  boxShadow: `0 0 4px ${ACCENT}`,
};

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "radial-gradient(ellipse at center, rgba(10,8,6,0.25) 0%, rgba(4,3,4,0.82) 78%)",
  textAlign: "center",
  userSelect: "none",
};

const playButtonStyle: React.CSSProperties = {
  marginTop: 10,
  padding: "14px 44px",
  fontSize: 15,
  letterSpacing: 4,
  fontWeight: 700,
  fontFamily: FONT,
  color: "#100a00",
  background: `linear-gradient(180deg,${ACCENT_BRIGHT},${ACCENT})`,
  border: "none",
  clipPath: CUT,
  cursor: "pointer",
  boxShadow: "0 6px 24px rgba(232,160,32,0.25)",
};
