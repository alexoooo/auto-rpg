export const TURN_SECONDS = 18;
export const TURN_SPEED = (Math.PI * 2) / TURN_SECONDS;

export type TurntableState = {
  playing: boolean;
  reducedMotion: boolean;
};

export function initialTurntableState(reducedMotion: boolean): TurntableState {
  return { playing: !reducedMotion, reducedMotion };
}

export function advanceAngle(angle: number, elapsedSeconds: number, playing: boolean): number {
  if (!playing || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return angle;
  const fullTurn = Math.PI * 2;
  return ((angle + TURN_SPEED * elapsedSeconds) % fullTurn + fullTurn) % fullTurn;
}

export function pauseForInspection(state: TurntableState): TurntableState {
  return state.playing ? { ...state, playing: false } : state;
}

export function toggleTurntable(state: TurntableState): TurntableState {
  return { ...state, playing: !state.playing };
}

export function resetTurntable(state: TurntableState): TurntableState {
  return { ...state, playing: !state.reducedMotion };
}
