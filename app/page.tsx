'use client';

import { useState } from 'react';
import GameComponent from '../components/GameComponent';
import Menu from '../components/Menu';
import { GameMode, Role } from '../lib/VolleyGame';

export default function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameConfig, setGameConfig] = useState<{ mode: GameMode, role: Role, roomId: string | null }>({
    mode: 'local',
    role: 'host',
    roomId: null
  });

  const handleStart = (mode: GameMode, role: Role, roomId: string | null) => {
    setGameConfig({ mode, role, roomId });
    setIsPlaying(true);
  };

  const handleBack = () => {
    setIsPlaying(false);
  };

  return (
    <main className="w-full h-screen overflow-hidden bg-black">
      {isPlaying ? (
        <GameComponent 
            mode={gameConfig.mode} 
            role={gameConfig.role} 
            roomId={gameConfig.roomId} 
            onBack={handleBack} 
        />
      ) : (
        <Menu onStart={handleStart} />
      )}
    </main>
  );
}
