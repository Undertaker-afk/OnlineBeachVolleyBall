'use client';
import { useEffect, useRef } from 'react';
import { VolleyGame, GameMode, Role } from '../lib/VolleyGame';

interface Props {
  mode: GameMode;
  role: Role;
  roomId: string | null;
  onBack: () => void;
}

export default function GameComponent({ mode, role, roomId, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<VolleyGame | null>(null);

  useEffect(() => {
    if (canvasRef.current && !gameRef.current) {
      gameRef.current = new VolleyGame(canvasRef.current, mode, role, roomId);
    }
    return () => {
      if (gameRef.current) {
        gameRef.current.dispose();
        gameRef.current = null;
      }
    };
  }, [mode, role, roomId]);

  return (
    <div className="relative w-full h-full">
        <canvas ref={canvasRef} className="w-full h-full touch-none outline-none" tabIndex={1} />
        <button 
            onClick={onBack}
            className="absolute top-4 left-4 bg-white/50 px-4 py-2 rounded text-black font-bold z-50 hover:bg-white/80"
        >
            Back to Menu
        </button>
        <div className="absolute top-4 right-4 text-black bg-white/50 px-2 py-1 rounded">
            Mode: {mode.toUpperCase()}
            {role && ` | Role: ${role.toUpperCase()}`}
        </div>
    </div>
  );
}
