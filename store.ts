import { create } from 'zustand';
import { FurnitureType, FurniturePattern } from './utils/geometry';

export interface AppState {
  type: FurnitureType;
  pattern: FurniturePattern;
  width: number;
  height: number;
  depth: number;
  seatHeight: number;
  frequency: number;
  amplitude: number;
  thickness: number;
  segments: number;
  structuralCore: boolean;
  coreThickness: number;
  taperLength: number;
  showGhost: boolean;
  filamentLength: number;
  estWeight: number;
  estCost: number;
  setParams: (params: Partial<AppState>) => void;
}

export const useStore = create<AppState>((set) => ({
  type: 'Hyperbolic',
  pattern: 'Octet',
  width: 0.8,
  height: 0.9,
  depth: 0.8,
  seatHeight: 0.45,
  frequency: 15,
  amplitude: 0.04,
  thickness: 0.015,
  segments: 40,
  structuralCore: true,
  coreThickness: 0.008,
  taperLength: 0.2,
  showGhost: false,
  filamentLength: 0,
  estWeight: 0,
  estCost: 0,
  setParams: (params) => set((state) => ({ ...state, ...params })),
}));
