import React, { useEffect } from 'react';
import { Leva, useControls, button } from 'leva';
import { Box, Download } from 'lucide-react';
import SensingScene from './components/SensingScene';
import { useStore } from './store';

const App: React.FC = () => {
  const {
    filamentLength,
    estWeight,
    estCost,
    setParams
  } = useStore();

  // Leva Controls
  const [{ type, pattern }, setType] = useControls('Object', () => ({
    type: { options: ['Chair', 'Table', 'Stool', 'Bench', 'Shelf', 'Vase', 'Recliner', 'Lamp', 'Mobius', 'Hyperbolic', 'Klein', 'FractalTree'], value: 'Hyperbolic' },
    pattern: { options: ['Linear', 'Triangular', 'Gyroid', 'Voronoi', 'SchwarzD', 'Octet', 'Sponge'], value: 'Octet' }
  }));

  const [{ width, height, depth, seatHeight }, setDims] = useControls('Dimensions', () => ({
    width: { value: 0.6, min: 0.2, max: 3.0 },
    height: { value: 0.9, min: 0.2, max: 3.0 },
    depth: { value: 0.6, min: 0.2, max: 3.0 },
    seatHeight: { value: 0.45, min: 0.1, max: 1.2 }
  }));

  const [{ frequency, amplitude, thickness, segments, structuralCore, coreThickness, taperLength }, setFab] = useControls('Fabrication', () => ({
    structuralCore: true,
    coreThickness: { value: 0.008, min: 0.002, max: 0.02 },
    frequency: { value: 15, min: 1, max: 40 },
    amplitude: { value: 0.04, min: 0.0, max: 0.15 },
    taperLength: { value: 0.2, min: 0.0, max: 0.5 },
    thickness: { value: 0.02, min: 0.005, max: 0.05 },
    segments: { value: 40, min: 10, max: 100, step: 1 }
  }));

  const [{ showGhost }] = useControls('View', () => ({
    showGhost: false,
    'Export STL': button(() => {
      window.dispatchEvent(new CustomEvent('export-stl'));
    })
  }));

  // Sync Leva to Zustand
  useEffect(() => {
    setParams({
      type: type as any, pattern: pattern as any,
      width, height, depth, seatHeight,
      frequency, amplitude, thickness, segments,
      structuralCore, coreThickness, taperLength,
      showGhost
    });
  }, [type, pattern, width, height, depth, seatHeight, frequency, amplitude, thickness, segments, structuralCore, coreThickness, taperLength, showGhost, setParams]);

  return (
    <div className="relative w-full h-screen bg-[#1a1a1a] text-white overflow-hidden">
      <SensingScene />
      
      {/* UI Overlay */}
      <div className="absolute left-4 top-4 z-10 max-w-sm pointer-events-none">
        <div className="bg-[#222]/80 backdrop-blur-md border border-white/10 rounded-xl p-5 shadow-2xl pointer-events-auto">
          <div className="flex items-center gap-3 mb-3">
            <Box className="w-6 h-6 text-amber-400" />
            <h1 className="text-lg font-bold tracking-wide">Parametric Studio <span className="text-amber-400">Pro</span></h1>
          </div>
          
          <div className="text-sm text-gray-300 space-y-3 font-sans leading-relaxed">
            <p>
              Advanced computational design tool for 3D printing. Generate complex organic structures like Voronoi Recliners, Hyphae Lamps, and Möbius Benches.
            </p>
            
            <div className="grid grid-cols-3 gap-2 py-3 border-y border-white/10 my-3">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Length</span>
                <span className="font-mono text-amber-400">{filamentLength.toFixed(2)}m</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Weight</span>
                <span className="font-mono text-amber-400">{estWeight.toFixed(1)}g</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Cost</span>
                <span className="font-mono text-amber-400">${estCost.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
              <Download className="w-3 h-3" />
              <span>Export .STL for fabrication</span>
            </div>
          </div>
        </div>
      </div>

      <Leva theme={{
        colors: {
          elevation1: '#222',
          elevation2: '#333',
          elevation3: '#444',
          accent1: '#fbbf24',
          accent2: '#f59e0b',
          accent3: '#d97706',
        }
      }} />
    </div>
  );
};

export default App;