
import React, { useState, useCallback, useEffect } from 'react';
import GameScene from './components/GameScene';
// import BlockSelector from './components/BlockSelector'; // Removed
import NextBlockPreview from './components/NextBlockPreview'; // Added
import Controls from './components/Controls'; // Keep for structure, though not actively used for block adding
import { BlockDefinition, BlockShapeType } from './types';
import { BLOCK_DEFINITIONS } from './constants';

const getRandomBlockDefinition = (): BlockDefinition => {
  const blockTypes = Object.values(BlockShapeType);
  const randomType = blockTypes[Math.floor(Math.random() * blockTypes.length)];
  return BLOCK_DEFINITIONS[randomType];
};

const App: React.FC = () => {
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    return Number(localStorage.getItem('wobblyTowerHighScore')) || 0;
  });

  // Initialize with a random block to ensure GameScene always gets a valid block
  const [selectedBlockDefinition, setSelectedBlockDefinition] = useState<BlockDefinition>(getRandomBlockDefinition());
  const [nextBlockDefinition, setNextBlockDefinition] = useState<BlockDefinition | null>(null);
  
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [gameKey, setGameKey] = useState<number>(0);
  const [isDelegationEnabled, setIsDelegationEnabled] = useState<boolean>(false); // New state for delegation toggle

  const initializeGameBlocks = useCallback(() => {
    setSelectedBlockDefinition(getRandomBlockDefinition());
    setNextBlockDefinition(getRandomBlockDefinition());
  }, []);

  useEffect(() => {
    initializeGameBlocks(); // Initialize on first mount
  }, [initializeGameBlocks]);

  const handleBlockSuccessfullyPlaced = useCallback(() => {
    if (nextBlockDefinition) {
      setSelectedBlockDefinition(nextBlockDefinition);
      setNextBlockDefinition(getRandomBlockDefinition());
    } else {
      // Fallback, should ideally not happen if initialized correctly
      initializeGameBlocks();
    }
  }, [nextBlockDefinition, initializeGameBlocks]);


  const handleGameOver = useCallback((finalScore: number) => {
    setIsGameOver(true);
    setCurrentScore(finalScore);
    if (finalScore > highScore) {
      setHighScore(finalScore);
      localStorage.setItem('wobblyTowerHighScore', finalScore.toString());
    }
  }, [highScore]);

  const handleRestart = useCallback(() => {
    setIsGameOver(false);
    setCurrentScore(0);
    initializeGameBlocks(); // Re-initialize blocks for the new game
    setGameKey(prevKey => prevKey + 1); 
  }, [initializeGameBlocks]);

  const handleDelegationToggle = () => {
    setIsDelegationEnabled(prev => !prev);
    // Future logic for delegation mode can be added here
  };

  useEffect(() => {
    if (isGameOver) {
      // Potentially show a modal or overlay
    }
  }, [isGameOver]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-sky-400 to-blue-600 text-white p-4">
      <header className="w-full max-w-4xl mb-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight">흔들흔들 탑 쌓기</h1>
        <p className="text-lg text-sky-100">높이높이 쌓아보세요, 무너지지 않게 조심하세요!</p>
      </header>
      
      <main className="w-full max-w-4xl flex flex-col lg:flex-row gap-4">
        <div className="flex-grow lg:w-3/4 aspect-[4/3] bg-black rounded-lg shadow-2xl overflow-hidden">
          {selectedBlockDefinition && ( // Ensure selectedBlockDefinition is loaded before rendering GameScene
            <GameScene
              key={gameKey}
              blockToPlace={selectedBlockDefinition}
              onGameOver={handleGameOver}
              onScoreUpdate={setCurrentScore}
              isGameOver={isGameOver}
              onBlockSuccessfullyPlaced={handleBlockSuccessfullyPlaced} // New prop
              isDelegationEnabled={isDelegationEnabled} // Pass delegation state
            />
          )}
        </div>
        
        <aside className="lg:w-1/4 flex flex-col gap-4 p-4 bg-white/20 backdrop-blur-md rounded-lg shadow-xl">
          <div className="text-center">
            <h2 className="text-2xl font-semibold">점수: {currentScore.toFixed(2)}m</h2>
            <p className="text-sm text-sky-200">최고 점수: {highScore.toFixed(2)}m</p>
          </div>
          
          {!isGameOver ? (
            <>
              {selectedBlockDefinition && (
                <div className="p-4 bg-white/10 backdrop-blur-sm rounded-lg shadow-md">
                  <h3 className="text-xl font-semibold mb-3 text-center text-white">현재 블록</h3>
                  <div
                    className="w-12 h-12 mx-auto mb-2 rounded-sm transition-all duration-300"
                    style={{ backgroundColor: `#${selectedBlockDefinition.color.toString(16).padStart(6, '0')}` }}
                    aria-label={`${selectedBlockDefinition.name} 현재 블록`}
                  ></div>
                  <p className="text-center text-white">{selectedBlockDefinition.name}</p>
                </div>
              )}
              <NextBlockPreview definition={nextBlockDefinition} />
              <div className="my-4 p-3 bg-white/10 backdrop-blur-sm rounded-lg shadow-md">
                <label htmlFor="delegationToggle" className="flex items-center justify-between cursor-pointer">
                  <span className="text-lg font-medium text-white">위임 모드</span>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      id="delegationToggle" 
                      className="sr-only peer" 
                      checked={isDelegationEnabled} 
                      onChange={handleDelegationToggle}
                      aria-label="위임 모드 토글"
                    />
                    <div className="w-12 h-7 bg-gray-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-green-500"></div>
                  </div>
                </label>
                 {isDelegationEnabled && (
                    <p className="text-xs text-sky-200 mt-2 text-center">위임 모드 활성: 블록이 자동으로 배치됩니다.</p>
                 )}
              </div>
            </>
          ) : (
            <div className="text-center p-4 bg-red-500/80 rounded-md">
              <h3 className="text-2xl font-bold mb-2">게임 종료!</h3>
              <p className="mb-4">탑 높이 {currentScore.toFixed(2)}m 달성!</p>
              <button
                onClick={handleRestart}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-800 font-bold py-3 px-4 rounded-lg transition-colors duration-150 shadow-md"
              >
                게임 다시 시작
              </button>
            </div>
          )}
           <button
            onClick={handleRestart}
            className="w-full mt-auto bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-150 shadow-md"
            aria-label="게임 초기화"
          >
            게임 초기화
          </button>
        </aside>
      </main>
      <footer className="mt-8 text-center text-sky-200 text-sm">
        <p>React, Three.js, Cannon-es, Tailwind CSS로 만들었습니다.</p>
      </footer>
    </div>
  );
};

export default App;
