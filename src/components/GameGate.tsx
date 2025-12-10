import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

interface GameGateProps {
    onWin: () => void;
}

export const GameGate = ({ onWin }: GameGateProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);
    // Use theme to style the game (optional, but nice)
    // We force dark mode look for the "Hacker/Game" portal usually

    // Game constants
    const CELL_SIZE = 20;
    const GRID_SIZE = 20; // 20x20 grid
    const TARGET_SCORE = 5;

    // Game state refs (to avoid closure staleness in game loop)
    const snakeRef = useRef([{ x: 10, y: 10 }]);
    const foodRef = useRef({ x: 15, y: 5 });
    const dirRef = useRef({ x: 0, y: 0 });
    const nextDirRef = useRef({ x: 0, y: 0 });
    const speedRef = useRef(150);
    const scoreRef = useRef(0);

    // Initialize/Reset Game
    const resetGame = () => {
        snakeRef.current = [{ x: 10, y: 10 }];
        spawnFood();
        dirRef.current = { x: 0, y: 0 };
        nextDirRef.current = { x: 0, y: 0 };
        scoreRef.current = 0;
        setScore(0);
        setGameOver(false);
        setGameStarted(false);
    };

    const spawnFood = () => {
        const x = Math.floor(Math.random() * GRID_SIZE);
        const y = Math.floor(Math.random() * GRID_SIZE);
        foodRef.current = { x, y };
    };

    // Input handling
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const { key } = e;
            // Prevent scrolling with arrows
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) {
                e.preventDefault();
            }

            if (gameOver) {
                if (key === 'Enter' || key === ' ') resetGame();
                return;
            }

            if (!gameStarted && (key.startsWith('Arrow') || ['w', 'a', 's', 'd'].includes(key.toLowerCase()))) {
                setGameStarted(true);
            }

            const current = dirRef.current;
            switch (key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    if (current.y === 0) nextDirRef.current = { x: 0, y: -1 };
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    if (current.y === 0) nextDirRef.current = { x: 0, y: 1 };
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    if (current.x === 0) nextDirRef.current = { x: -1, y: 0 };
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    if (current.x === 0) nextDirRef.current = { x: 1, y: 0 };
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameOver, gameStarted]);

    // Game Loop
    useEffect(() => {
        if (gameOver) return;

        const loop = setInterval(() => {
            if (!gameStarted) return;

            // Move
            dirRef.current = nextDirRef.current;
            const dir = dirRef.current;

            // If strictly no movement yet (start), don't update
            if (dir.x === 0 && dir.y === 0) return;

            const head = { ...snakeRef.current[0] };
            head.x += dir.x;
            head.y += dir.y;

            // Check collision with walls
            if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
                setGameOver(true);
                return;
            }

            // Check collision with self
            if (snakeRef.current.some(segment => segment.x === head.x && segment.y === head.y)) {
                setGameOver(true);
                return;
            }

            // Move snake
            snakeRef.current.unshift(head);

            // Check Food
            if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
                scoreRef.current += 1;
                setScore(scoreRef.current);
                spawnFood();

                // Win Condition
                if (scoreRef.current >= TARGET_SCORE) {
                    onWin();
                }
            } else {
                snakeRef.current.pop();
            }

        }, speedRef.current);

        return () => clearInterval(loop);
    }, [gameStarted, gameOver]);

    // Render Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const render = () => {
            // Clear
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Grid (subtle)
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            for (let i = 0; i <= GRID_SIZE; i++) {
                ctx.beginPath();
                ctx.moveTo(i * CELL_SIZE, 0);
                ctx.lineTo(i * CELL_SIZE, GRID_SIZE * CELL_SIZE);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, i * CELL_SIZE);
                ctx.lineTo(GRID_SIZE * CELL_SIZE, i * CELL_SIZE);
                ctx.stroke();
            }

            // Draw Food
            ctx.fillStyle = '#FF9D9D'; // Pink food
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#FF9D9D';
            ctx.fillRect(
                foodRef.current.x * CELL_SIZE + 2,
                foodRef.current.y * CELL_SIZE + 2,
                CELL_SIZE - 4,
                CELL_SIZE - 4
            );
            ctx.shadowBlur = 0;

            // Draw Snake
            ctx.fillStyle = '#a78bfa'; // Purple/White theme
            snakeRef.current.forEach((segment, index) => {
                // Head is brighter
                ctx.fillStyle = index === 0 ? '#FFFFFFFF' : '#a78bfa';
                ctx.fillRect(
                    segment.x * CELL_SIZE + 1,
                    segment.y * CELL_SIZE + 1,
                    CELL_SIZE - 2,
                    CELL_SIZE - 2
                );
            });

            // Draw Win/Game Over text handled by React overlay
            requestAnimationFrame(render);
        };

        const animId = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animId);
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0f0f0f] text-white overflow-hidden">
            <h1 className="font-h1 text-4xl mb-2 text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
                SYSTEM LOCKED
            </h1>
            <p className="font-paragraph text-gray-400 mb-8 max-w-md text-center">
                Collect <span className="text-white font-bold">{TARGET_SCORE}</span> data packets to authenticate and access the portfolio.
            </p>

            <div className="relative border-4 border-gray-800 rounded-lg p-1 bg-[#1a1a1a] shadow-2xl">
                <canvas
                    ref={canvasRef}
                    width={GRID_SIZE * CELL_SIZE}
                    height={GRID_SIZE * CELL_SIZE}
                    className="block"
                />

                {(!gameStarted && !gameOver) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="text-center">
                            <p className="font-mono text-sm text-gray-300 mb-2">Use Arrow Keys or WASD</p>
                            <p className="font-bold text-white blink">Press Any Key to Start</p>
                        </div>
                    </div>
                )}

                {gameOver && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-900/50 backdrop-blur-sm">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-red-500 mb-2">ACCESS DENIED</h2>
                            <button
                                onClick={resetGame}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
                            >
                                RETRY AUTHENTICATION
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-8 font-mono text-xl">
                AUTHENTICATION PROGRESS: {score} / {TARGET_SCORE}
            </div>

            <div className="absolute bottom-8 text-xs text-gray-600">
                SECURE GATEWAY v1.0.0 // CLARK_PENG_PORTFOLIO
            </div>
        </div>
    );
};
