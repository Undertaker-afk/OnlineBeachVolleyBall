'use client';
import { useState } from 'react';
import { NostrMatchmaker } from '../lib/NostrService';
import { GameMode, Role } from '../lib/VolleyGame';

interface Props {
  onStart: (mode: GameMode, role: Role, roomId: string | null) => void;
}

export default function Menu({ onStart }: Props) {
  const [status, setStatus] = useState('');

  const handleOnline = async () => {
    setStatus('Searching for match on Nostr...');
    const matchmaker = new NostrMatchmaker();
    matchmaker.startSearching((roomId, role) => {
        setStatus(`Match found! Role: ${role}. Connecting...`);
        // Add delay to let user see connection status
        setTimeout(() => {
            onStart('online', role, roomId);
        }, 1500);
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-blue-400 gap-4">
      <h1 className="text-4xl font-bold text-white mb-8">Beach Volley Babylon</h1>
      
      <button 
        onClick={() => onStart('local', 'host', null)}
        className="px-8 py-4 bg-yellow-400 rounded-lg font-bold text-xl hover:bg-yellow-300 transition w-80 text-black shadow-lg"
      >
        Local PvP (2 Players)
      </button>

      <button 
        onClick={() => onStart('pvcpu', 'host', null)}
        className="px-8 py-4 bg-orange-400 rounded-lg font-bold text-xl hover:bg-orange-300 transition w-80 text-black shadow-lg"
      >
        Player vs CPU
      </button>

      <button 
        onClick={handleOnline}
        disabled={!!status}
        className="px-8 py-4 bg-green-400 rounded-lg font-bold text-xl hover:bg-green-300 transition w-80 text-black shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status || 'Online P2P Match (Nostr)'}
      </button>
      
      <div className="mt-8 text-white/90 text-sm max-w-md text-center bg-black/20 p-4 rounded-xl backdrop-blur-sm">
        <h3 className="font-bold mb-2">Controls</h3>
        <div className="grid grid-cols-2 gap-4 text-left">
            <div>
                <span className="font-bold text-yellow-300">Player 1 (Left)</span>
                <ul className="list-disc ml-4">
                    <li>A: Move Left</li>
                    <li>D: Move Right</li>
                    <li>W: Jump</li>
                </ul>
            </div>
            <div>
                <span className="font-bold text-blue-300">Player 2 (Right)</span>
                <ul className="list-disc ml-4">
                    <li>J: Move Left</li>
                    <li>L: Move Right</li>
                    <li>I: Jump</li>
                </ul>
            </div>
        </div>
      </div>
    </div>
  );
}
