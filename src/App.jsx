import React, { useState, useEffect } from 'react';
import { probeTileLatency, calculateRaytracedPing, OBSTACLE_PENALTIES } from './utils/networkEngine';
import { Wifi, Zap, Router, Square, DoorClosed, DoorOpen, Layers, RefreshCw, BedDouble, Clock, Users } from 'lucide-react';

const ROWS = 5;
const COLS = 8;

export default function App() {
  const [grid, setGrid] = useState(() => {
    const saved = localStorage.getItem('corridorPingGrid_v3');
    if (saved) return JSON.parse(saved);
    return Array.from({ length: ROWS * COLS }, (_, i) => ({
      id: i, row: Math.floor(i / COLS) + 1, col: (i % COLS) + 1,
      type: 'floor', ping: null, jitter: null, status: 'UNTESTED', predictedPing: null
    }));
  });

  const [mode, setMode] = useState('probe'); 
  const [timeOfDay, setTimeOfDay] = useState('afternoon'); // afternoon, evening, midnight
  const [isProbing, setIsProbing] = useState(false);
  const [activeNotification, setActiveNotification] = useState('Place a Router, then add Walls/Beds to see Raycasting!');
  const [squadRoles, setSquadRoles] = useState([]);

  // Time based congestion penalties (Hostel Rush Simulator)
  const timePenalties = {
    afternoon: 0,   // 2 PM - Empty hostel
    evening: 45,    // 7 PM - Normal load
    midnight: 120   // 11 PM - Heavy gaming/downloading load
  };

  const routerTile = grid.find(t => t.type === 'router');

  useEffect(() => {
    localStorage.setItem('corridorPingGrid_v3', JSON.stringify(grid));
  }, [grid]);

  // Recalculate Raycasting when Time of Day changes
  useEffect(() => {
    if (routerTile) {
      setGrid(prev => prev.map(tile => {
        if (tile.type === 'floor' || tile.type === 'bed') {
          const ray = calculateRaytracedPing(routerTile, tile, prev, COLS, 28 + timePenalties[timeOfDay]);
          return { ...tile, predictedPing: ray ? ray.predictedPing : null };
        }
        return tile;
      }));
    }
  }, [timeOfDay]);

  const handleTileClick = async (clickedTile) => {
    if (isProbing) return;

    // Obstacle placement logic
    if (mode !== 'probe') {
      const updatedGrid = grid.map(tile => {
        if (tile.id === clickedTile.id) {
          return { ...tile, type: tile.type === mode ? 'floor' : mode, ping: null, predictedPing: null };
        }
        if (mode === 'router' && tile.type === 'router' && tile.id !== clickedTile.id) {
          return { ...tile, type: 'floor' };
        }
        return tile;
      });

      const currentRouter = updatedGrid.find(t => t.type === 'router');
      const finalGrid = updatedGrid.map(tile => {
        if ((tile.type === 'floor' || tile.type === 'bed') && currentRouter) {
          const ray = calculateRaytracedPing(currentRouter, tile, updatedGrid, COLS, 28 + timePenalties[timeOfDay]);
          return { ...tile, predictedPing: ray ? ray.predictedPing : null };
        }
        return { ...tile, predictedPing: null };
      });

      setGrid(finalGrid);
      return;
    }

    if (['wall', 'almirah'].includes(clickedTile.type)) {
      setActiveNotification('Cannot probe solid obstacles!');
      return;
    }

    // Live Probe Logic
    setIsProbing(true);
    setActiveNotification(`Probing 10-packet burst for R${clickedTile.row}:C${clickedTile.col}...`);
    const result = await probeTileLatency(10);

    setGrid(prev => prev.map(tile => 
      tile.id === clickedTile.id ? { ...tile, ping: result.avgPing, jitter: result.jitter, status: result.status } : tile
    ));
    setIsProbing(false);
    setActiveNotification(`Tested R${clickedTile.row}:C${clickedTile.col} -> ${result.avgPing}ms`);
  };

  // Squad Allocator Logic (DSA Feature)
  const allocateSquad = () => {
    const beds = grid.filter(t => t.type === 'bed');
    if (beds.length < 4) {
      setActiveNotification('Place at least 4 Beds on the grid first!');
      return;
    }
    
    const sortedBeds = [...beds].sort((a, b) => {
      const pingA = a.ping || a.predictedPing || 999;
      const pingB = b.ping || b.predictedPing || 999;
      return pingA - pingB;
    });

    setSquadRoles([
      { role: 'Assaulter (Zero Lag)', tile: sortedBeds[0], color: 'text-emerald-400' },
      { role: 'Sniper/IGL', tile: sortedBeds[1], color: 'text-teal-400' },
      { role: 'Lecture/YouTube', tile: sortedBeds[2], color: 'text-amber-400' },
      { role: 'Offline Study/Downloads', tile: sortedBeds[3], color: 'text-rose-400' }
    ]);
    setActiveNotification('Squad Seats Allocated perfectly!');
  };

  const resetBoard = () => {
    localStorage.removeItem('corridorPingGrid_v3');
    window.location.reload();
  };

  const getTileColor = (tile) => {
    if (tile.type === 'wall') return 'bg-slate-900 border-slate-700 text-slate-500 opacity-60';
    if (tile.type === 'almirah') return 'bg-zinc-900 border-zinc-700 text-zinc-400';
    if (tile.type === 'router') return 'bg-indigo-600/30 border-indigo-500 text-indigo-300 animate-pulse';
    if (tile.type === 'door_shut') return 'bg-amber-950/40 border-amber-700/50 text-amber-400';
    if (tile.type === 'door_open') return 'bg-emerald-950/40 border-emerald-700/50 text-emerald-400';
    if (tile.type === 'bed') return 'bg-cyan-900/30 border-cyan-700/50 text-cyan-300';

    const val = tile.ping || tile.predictedPing;
    if (val === null) return 'bg-slate-900/60 border-slate-800 text-slate-400';
    if (val > 150) return 'bg-rose-600/30 border-rose-500 text-rose-200';
    if (val > 80) return 'bg-amber-500/30 border-amber-400 text-amber-200';
    return 'bg-emerald-500/30 border-emerald-400 text-emerald-200';
  };

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-4 gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-emerald-400 flex items-center gap-2">
              <Wifi className="w-7 h-7 animate-pulse" /> CorridorPing // Wing Mapper
            </h1>
          </div>
          <button onClick={resetBoard} className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 px-3 py-2 rounded-xl text-sm">
            <RefreshCw className="w-4 h-4" /> Reset Grid
          </button>
        </div>

        {/* Toolbar with Time Slider */}
        <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-2xl flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'probe', label: 'Live Probe', icon: Zap },
              { id: 'router', label: 'Router', icon: Router },
              { id: 'wall', label: 'Wall', icon: Square },
              { id: 'almirah', label: 'Locker', icon: Layers },
              { id: 'bed', label: 'Bed', icon: BedDouble },
            ].map(m => (
              <button
                key={m.id} onClick={() => setMode(m.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold ${
                  mode === m.id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800/80 text-slate-300'
                }`}
              >
                <m.icon className="w-4 h-4" /> {m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 border-l border-slate-700 pl-4">
            <Clock className="w-4 h-4 text-slate-400" />
            <select 
              value={timeOfDay} 
              onChange={(e) => setTimeOfDay(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-300 outline-none"
            >
              <option value="afternoon">2:00 PM (Clear)</option>
              <option value="evening">7:00 PM (Moderate)</option>
              <option value="midnight">11:00 PM (Hostel Rush)</option>
            </select>
          </div>
        </div>

        {/* Squad Allocator Display */}
        {squadRoles.length > 0 && (
          <div className="bg-slate-900 border border-indigo-500/50 p-4 rounded-xl flex justify-between items-center shadow-[0_0_15px_rgba(99,102,241,0.1)]">
            {squadRoles.map((squad, i) => (
              <div key={i} className="text-center px-4 border-r last:border-0 border-slate-700 w-1/4">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">{squad.role}</p>
                <p className={`text-lg font-bold mt-1 ${squad.color}`}>Bed at R{squad.tile.row}:C{squad.tile.col}</p>
              </div>
            ))}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl overflow-x-auto">
          <div className="flex justify-between items-end mb-3 px-1">
            <span className="text-xs text-slate-500 font-mono">← BALCONY SIDE</span>
            <button onClick={allocateSquad} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-500/20">
              <Users className="w-4 h-4" /> Auto-Assign Squad
            </button>
            <span className="text-xs text-slate-500 font-mono">CORRIDOR SIDE →</span>
          </div>
          
          <div className="grid grid-cols-8 gap-3 min-w-[700px]">
            {grid.map(tile => (
              <button
                key={tile.id} disabled={isProbing} onClick={() => handleTileClick(tile)}
                className={`h-24 rounded-xl border flex flex-col items-center justify-between p-2.5 transition-all ${getTileColor(tile)}`}
              >
                <div className="w-full flex justify-between text-[10px] opacity-60 font-mono">
                  <span>R{tile.row}:C{tile.col}</span>
                </div>
                <div className="flex flex-col items-center justify-center">
                  {tile.type === 'router' && <Router className="w-6 h-6 text-indigo-400 mb-1" />}
                  {tile.type === 'wall' && <span className="text-xs font-bold">WALL</span>}
                  {tile.type === 'bed' && <BedDouble className="w-6 h-6 mb-1 opacity-80" />}
                  {(tile.type === 'floor' || tile.type === 'bed') && (
                    <span className="text-lg font-black">
                      {tile.ping !== null ? `${tile.ping}ms` : (tile.predictedPing ? `~${tile.predictedPing}ms` : '+')}
                    </span>
                  )}
                </div>
                <div className="text-[9px] font-mono opacity-50 truncate">
                  {tile.type.toUpperCase()}
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}