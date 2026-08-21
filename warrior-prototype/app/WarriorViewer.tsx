"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initialTurntableState, resetTurntable, toggleTurntable } from "./turntable-state";
import type { WarriorSceneHandle } from "./warrior-scene";

export function WarriorViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WarriorSceneHandle | null>(null);
  const [status, setStatus] = useState("Forging the warrior...");
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let cancelled = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const initial = initialTurntableState(reducedMotion);
    setPlaying(initial.playing);

    void import("./warrior-scene").then(({ createWarriorScene }) =>
      createWarriorScene(canvas, {
        playing: initial.playing,
        onInspection: () => setPlaying(false),
        onProgress: setStatus,
      }),
    ).then((handle) => {
      if (cancelled) {
        handle.dispose();
        return;
      }
      sceneRef.current = handle;
      setStatus("");
    }).catch((reason: unknown) => {
      if (cancelled) return;
      setError(true);
      setStatus(`The warrior could not be loaded: ${reason instanceof Error ? reason.message : String(reason)}`);
    });

    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    setPlaying((current) => {
      const next = toggleTurntable({ playing: current, reducedMotion: false }).playing;
      sceneRef.current?.setPlaying(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = resetTurntable({ playing, reducedMotion }).playing;
    sceneRef.current?.reset(next);
    setPlaying(next);
  }, [playing]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      toggle();
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      reset();
    }
  }, [reset, toggle]);

  return (
    <main className="viewer-shell">
      <header className="viewer-heading">
        <p className="viewer-kicker">Independent rendering study</p>
        <h1>Warrior</h1>
        <p className="viewer-help">Drag to inspect · wheel or pinch to zoom · Space pauses · R resets</p>
      </header>
      <canvas
        ref={canvasRef}
        className="viewer-canvas"
        aria-label="Interactive rotating three-dimensional warrior"
        tabIndex={0}
        onKeyDown={onKeyDown}
      />
      <div className="viewer-controls" aria-label="Turntable controls">
        <button type="button" onClick={toggle} aria-pressed={!playing}>{playing ? "Pause" : "Resume"}</button>
        <button type="button" onClick={reset}>Reset</button>
      </div>
      <p className="viewer-status" role="status" data-error={error} hidden={status === ""}>{status}</p>
    </main>
  );
}
