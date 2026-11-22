/** Shared, non-authenticated runtime counters for the on-screen diagnostic panel. */
export interface HandDiagnostics {
  mode: string;
  delegate: string;
  pump: string;
  framesSent: number;
  framesBack: number;
  handsSeen: number;
  inferenceFps: number;
  videoTime: number;
  readyState: number;
  lastError: string;
  status: string;
}

export const handDiagnostics: HandDiagnostics = {
  mode: "idle",
  delegate: "-",
  pump: "-",
  framesSent: 0,
  framesBack: 0,
  handsSeen: 0,
  inferenceFps: 0,
  videoTime: 0,
  readyState: 0,
  lastError: "",
  status: "starting",
};

export function writeHandDiagnostics(patch: Partial<HandDiagnostics>): void {
  Object.assign(handDiagnostics, patch);
}
