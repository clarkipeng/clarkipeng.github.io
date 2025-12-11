import { useState, useEffect, useRef } from 'react';

interface GameGateProps {
    onWin: () => void;
}

export const GameGate = ({ onWin }: GameGateProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Interaction state
    const isMouseDownRef = useRef(false);
    const lastMousePosRef = useRef({ x: 0, y: 0 }); // for delta calculation
    const hoverPosRef = useRef({ x: 0, y: 0 }); // for visualization
    const isMouseOverRef = useRef(false);

    const [arrowSubpoints, setArrowSubpoints] = useState(0); // 0 = off, >0 = subpoints
    const arrowSubpointsRef = useRef(0);
    const changeArrowMode = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = parseInt(e.target.value);
        setArrowSubpoints(val);
        arrowSubpointsRef.current = val;
    };
    const [brushMode, setBrushMode] = useState('vel');
    const brushModeRef = useRef('vel');
    const changeBrushMode = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setBrushMode(val);
        brushModeRef.current = val;
    };
    const [gridLines, setGridLines] = useState(true);
    const gridLinesRef = useRef(true);
    const changeGridMode = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value === 'on';
        setGridLines(val);
        gridLinesRef.current = val;
    };

    const [renderMode, setRenderMode] = useState('smoke');
    const renderModeRef = useRef('smoke');
    const changeRenderMode = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newVal = e.target.value;
        setRenderMode(newVal);
        renderModeRef.current = newVal;
    };

    const [velocityDecay, setVelocityDecay] = useState(1.0);
    const velocityDecayRef = useRef(1.0);
    const handleVelocityDecayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVelocityDecay(val);
        velocityDecayRef.current = val;
    };

    const [smokeDiffusionRate, setSmokeDiffusionRate] = useState(0.0);
    const smokeDiffusionRateRef = useRef(0.0);
    const handleSmokeDiffusionRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setSmokeDiffusionRate(val);
        smokeDiffusionRateRef.current = val;
    };

    const MINRES = 80;
    const RHO = 1;
    const OMEGA = 1.7;
    const BRUSH_FORCE = 0.5;
    const SMOKE_TEMP = 100;

    // Fixed grid dimensions - computed once
    const CELL_SIZE = Math.floor(Math.min(window.innerWidth, window.innerHeight) / MINRES);
    const COLS = Math.ceil(window.innerWidth / CELL_SIZE);
    const ROWS = Math.ceil(window.innerHeight / CELL_SIZE);


    const randomize = () => {
        const board = boardRef.current;
        const velocityX = velocityXRef.current;
        const velocityY = velocityYRef.current;

        for (let i = 1; i < COLS - 1; i++) {
            for (let j = 1; j < ROWS - 1; j++) {
                if (board[i][j].isSolid) continue;
                if (i < COLS - 1) velocityX[i][j] = Math.random() * 2 - 1;
                if (j < ROWS - 1) velocityY[i][j] = Math.random() * 2 - 1;
                board[i][j].smoke = { r: Math.random() * 64, g: Math.random() * 64, b: Math.random() * 64, t: 0 };
            }
        }
    };

    const boardRef = useRef(
        Array(COLS).fill(0).map(() =>
            Array(ROWS).fill(0).map(() => ({ color: '#1a1a1a', smoke: { r: 0, g: 0, b: 0, t: 0 }, div: 0, isSolid: false }))
        )
    );
    const velocityXRef = useRef(
        Array(COLS - 1).fill(0).map(() =>
            Array(ROWS).fill(0).map(() => 0)
        )
    );
    const velocityYRef = useRef(
        Array(COLS).fill(0).map(() =>
            Array(ROWS - 1).fill(0).map(() => 0)
        )
    );
    const tempVelocityXRef = useRef(
        Array(COLS - 1).fill(0).map(() => Array(ROWS).fill(0))
    );
    const tempVelocityYRef = useRef(
        Array(COLS).fill(0).map(() => Array(ROWS - 1).fill(0))
    );
    const tempSmokeRef = useRef(
        Array(COLS).fill(0).map(() =>
            Array(ROWS).fill(0).map(() => ({ r: 0, g: 0, b: 0, t: 0 }))
        )
    );

    for (let i = 0; i < COLS; i++) {
        boardRef.current[i][0].isSolid = true;
        boardRef.current[i][ROWS - 1].isSolid = true;
    }
    for (let j = 0; j < ROWS; j++) {
        boardRef.current[0][j].isSolid = true;
        boardRef.current[COLS - 1][j].isSolid = true;
    }

    // Shared helper: interpolate velocityX at position (x, y) in cell units
    // velocityX[i][j] is at (i + 0.5, j)
    const sampleVX = (x: number, y: number): number => {
        const velocityX = velocityXRef.current;
        const sx = x - 0.5;
        const sy = y;
        const i = Math.floor(sx);
        const j = Math.floor(sy);
        const fx = sx - i;
        const fy = sy - j;

        const i0 = Math.max(0, Math.min(i, COLS - 2));
        const i1 = Math.max(0, Math.min(i + 1, COLS - 2));
        const j0 = Math.max(0, Math.min(j, ROWS - 1));
        const j1 = Math.max(0, Math.min(j + 1, ROWS - 1));

        return (1 - fx) * (1 - fy) * velocityX[i0][j0] +
            fx * (1 - fy) * velocityX[i1][j0] +
            (1 - fx) * fy * velocityX[i0][j1] +
            fx * fy * velocityX[i1][j1];
    };

    // Shared helper: interpolate velocityY at position (x, y) in cell units
    // velocityY[i][j] is at (i, j + 0.5)
    const sampleVY = (x: number, y: number): number => {
        const velocityY = velocityYRef.current;
        const sx = x;
        const sy = y - 0.5;
        const i = Math.floor(sx);
        const j = Math.floor(sy);
        const fx = sx - i;
        const fy = sy - j;

        const i0 = Math.max(0, Math.min(i, COLS - 1));
        const i1 = Math.max(0, Math.min(i + 1, COLS - 1));
        const j0 = Math.max(0, Math.min(j, ROWS - 2));
        const j1 = Math.max(0, Math.min(j + 1, ROWS - 2));

        return (1 - fx) * (1 - fy) * velocityY[i0][j0] +
            fx * (1 - fy) * velocityY[i1][j0] +
            (1 - fx) * fy * velocityY[i0][j1] +
            fx * fy * velocityY[i1][j1];
    };

    const sampleSmoke = (x: number, y: number): { r: number; g: number; b: number; t: number } => {
        const smoke = boardRef.current;
        const sx = x - 0.5;
        const sy = y - 0.5;
        const i = Math.floor(sx);
        const j = Math.floor(sy);
        const fx = sx - i;
        const fy = sy - j;

        const i0 = Math.max(0, Math.min(i, COLS - 1));
        const i1 = Math.max(0, Math.min(i + 1, COLS - 1));
        const j0 = Math.max(0, Math.min(j, ROWS - 2));
        const j1 = Math.max(0, Math.min(j + 1, ROWS - 2));

        return {
            r: (1 - fx) * (1 - fy) * smoke[i0][j0].smoke.r + fx * (1 - fy) * smoke[i1][j0].smoke.r + (1 - fx) * fy * smoke[i0][j1].smoke.r + fx * fy * smoke[i1][j1].smoke.r,
            g: (1 - fx) * (1 - fy) * smoke[i0][j0].smoke.g + fx * (1 - fy) * smoke[i1][j0].smoke.g + (1 - fx) * fy * smoke[i0][j1].smoke.g + fx * fy * smoke[i1][j1].smoke.g,
            b: (1 - fx) * (1 - fy) * smoke[i0][j0].smoke.b + fx * (1 - fy) * smoke[i1][j0].smoke.b + (1 - fx) * fy * smoke[i0][j1].smoke.b + fx * fy * smoke[i1][j1].smoke.b,
            t: (1 - fx) * (1 - fy) * smoke[i0][j0].smoke.t + fx * (1 - fy) * smoke[i1][j0].smoke.t + (1 - fx) * fy * smoke[i0][j1].smoke.t + fx * fy * smoke[i1][j1].smoke.t
        };
    };

    // Interaction Handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        isMouseDownRef.current = true;
        const rect = canvasRef.current!.getBoundingClientRect();
        lastMousePosRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };
    const handleMouseUp = () => {
        isMouseDownRef.current = false;
    };
    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update hover position for visualization
        hoverPosRef.current = { x, y };
        isMouseOverRef.current = true;

        if (!isMouseDownRef.current) {
            // Just update last pos so start of drag is smooth
            lastMousePosRef.current = { x, y };
            return;
        }

        const lastX = lastMousePosRef.current.x;
        const lastY = lastMousePosRef.current.y;

        const dx = x - lastX;
        const dy = y - lastY;

        // Update last position
        lastMousePosRef.current = { x, y };

        // Inject velocity
        const cellX = Math.floor(x / CELL_SIZE);
        const cellY = Math.floor(y / CELL_SIZE);
        const radius = 2;

        for (let i = -radius; i <= radius; i++) {
            for (let j = -radius; j <= radius; j++) {
                const cx = cellX + i;
                const cy = cellY + j;

                if (cx > 0 && cx < COLS - 1 && cy > 0 && cy < ROWS - 1) {
                    const distSq = i * i + j * j;
                    if (distSq < radius * radius) {
                        const falloff = Math.exp(-distSq / (radius * radius)); // Smoother falloff
                        const force = BRUSH_FORCE * falloff;

                        if (brushModeRef.current === 'vel') {
                            velocityXRef.current[cx][cy] += dx * force;
                            velocityYRef.current[cx][cy] += dy * force;
                        } else if (brushModeRef.current === 'smoke') {
                            const smoke = boardRef.current[cx][cy].smoke;
                            // Add smoke density
                            smoke.r = 255;
                            smoke.g = 255;
                            smoke.b = 255;
                            smoke.t = SMOKE_TEMP; // Not really used for color but logic exists
                        }
                    }
                }
            }
        }
    };

    // Physics Loop
    useEffect(() => {
        const board = boardRef.current;
        const velocityX = velocityXRef.current;
        const velocityY = velocityYRef.current;

        let lastTime = performance.now();

        const physics = () => {
            const now = performance.now();
            const dt = Math.min((now - lastTime) / 1000, 0.1); // clamp to avoid instability
            lastTime = now;

            const vel_decay = Math.exp(dt * Math.log(velocityDecayRef.current));
            // Linear diffusion rate based on slider
            const diffuse_rate = Math.max(0, Math.min(1, smokeDiffusionRateRef.current * dt));

            if (dt <= 0) {
                requestAnimationFrame(physics);
                return;
            }

            const newVelocityX = tempVelocityXRef.current;
            const newVelocityY = tempVelocityYRef.current;
            const newSmoke = tempSmokeRef.current;

            // Advect velocityX
            for (let i = 0; i < COLS; i++) {
                for (let j = 0; j < ROWS; j++) {
                    // Position of this velocity sample in cell units
                    if (i < COLS - 1) {
                        const x = i + 0.5;
                        const y = j;

                        const vx = sampleVX(x, y);
                        const vy = sampleVY(x, y);
                        const prevX = x - vx * dt;
                        const prevY = y - vy * dt;

                        newVelocityX[i][j] = sampleVX(prevX, prevY);
                    }
                    if (j < ROWS - 1) {
                        const x = i;
                        const y = j + 0.5;

                        const vx = sampleVX(x, y);
                        const vy = sampleVY(x, y);
                        const prevX = x - vx * dt;
                        const prevY = y - vy * dt;

                        newVelocityY[i][j] = sampleVY(prevX, prevY);
                    }

                    const x = i + 0.5;
                    const y = j + 0.5;
                    const vx = sampleVX(x, y);
                    const vy = sampleVY(x, y);
                    const prevX = x - vx * dt;
                    const prevY = y - vy * dt;
                    newSmoke[i][j] = sampleSmoke(prevX, prevY);
                }
            }
            // Copy new velocities back 
            for (let i = 0; i < COLS; i++) {
                for (let j = 0; j < ROWS; j++) {
                    if (i < COLS - 1) {
                        velocityX[i][j] = vel_decay * newVelocityX[i][j];
                    }
                    if (j < ROWS - 1) {
                        velocityY[i][j] = vel_decay * newVelocityY[i][j];
                    }

                    const cell = board[i][j];
                    if (cell.isSolid) continue;

                    //diffuse smoke from neighbors 
                    let s = 0;
                    let laplacian = { r: 0, g: 0, b: 0, t: 0 }
                    if (!board[i - 1][j].isSolid) {
                        s++;
                        laplacian.r += newSmoke[i - 1][j].r;
                        laplacian.g += newSmoke[i - 1][j].g;
                        laplacian.b += newSmoke[i - 1][j].b;
                        laplacian.t += newSmoke[i - 1][j].t;
                    }
                    if (!board[i + 1][j].isSolid) {
                        s++;
                        laplacian.r += newSmoke[i + 1][j].r;
                        laplacian.g += newSmoke[i + 1][j].g;
                        laplacian.b += newSmoke[i + 1][j].b;
                        laplacian.t += newSmoke[i + 1][j].t;
                    }
                    if (!board[i][j - 1].isSolid) {
                        s++;
                        laplacian.r += newSmoke[i][j - 1].r;
                        laplacian.g += newSmoke[i][j - 1].g;
                        laplacian.b += newSmoke[i][j - 1].b;
                        laplacian.t += newSmoke[i][j - 1].t;
                    }
                    if (!board[i][j + 1].isSolid) {
                        s++;
                        laplacian.r += newSmoke[i][j + 1].r;
                        laplacian.g += newSmoke[i][j + 1].g;
                        laplacian.b += newSmoke[i][j + 1].b;
                        laplacian.t += newSmoke[i][j + 1].t;
                    }
                    cell.smoke = {
                        r: newSmoke[i][j].r + (laplacian.r / s - newSmoke[i][j].r) * diffuse_rate,
                        g: newSmoke[i][j].g + (laplacian.g / s - newSmoke[i][j].g) * diffuse_rate,
                        b: newSmoke[i][j].b + (laplacian.b / s - newSmoke[i][j].b) * diffuse_rate,
                        t: newSmoke[i][j].t + (laplacian.t / s - newSmoke[i][j].t) * diffuse_rate
                    };
                }
            }
            // === PRESSURE SOLVE ===
            // const K = dt / (RHO * CELL_SIZE * CELL_SIZE);
            // const invK = 1 / K;
            for (let iter = 0; iter < 10; iter++) {
                for (let i = 1; i < COLS - 1; i++) {
                    for (let j = 1; j < ROWS - 1; j++) {
                        const cell = board[i][j];
                        if (cell.isSolid) continue;

                        // Count non-solid neighbors and compute divergence for ALL edges
                        let s = 0; // number of fluid neighbors
                        if (!board[i - 1][j].isSolid) s++;
                        if (!board[i + 1][j].isSolid) s++;
                        if (!board[i][j - 1].isSolid) s++;
                        if (!board[i][j + 1].isSolid) s++;

                        if (s === 0) continue;

                        let div = 0;
                        div -= velocityX[i - 1][j]; // left edge
                        div += velocityX[i][j]; // right edge
                        div -= velocityY[i][j - 1]; // top edge
                        div += velocityY[i][j]; // bottom edge

                        // Solve for pressure: make divergence zero
                        const p = -div / s * OMEGA;
                        // Update velocities to cancel divergence
                        if (!board[i - 1][j].isSolid && i > 0) velocityX[i - 1][j] -= p;
                        if (!board[i + 1][j].isSolid && i < COLS - 1) velocityX[i][j] += p;
                        if (!board[i][j - 1].isSolid && j > 0) velocityY[i][j - 1] -= p;
                        if (!board[i][j + 1].isSolid && j < ROWS - 1) velocityY[i][j] += p;

                        cell.div = div;
                    }
                }
            }
            requestAnimationFrame(physics);
        };
        physics();
    }, []);

    // Render Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = COLS * CELL_SIZE;
        const height = ROWS * CELL_SIZE;
        const board = boardRef.current;
        const render = () => {
            // Clear
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, width, height);

            // Draw cells and velocity arrows
            for (let i = 0; i < COLS; i++) {
                for (let j = 0; j < ROWS; j++) {
                    const cell = board[i][j];
                    if (cell.isSolid) continue;

                    // Determine cell color
                    const mode = renderModeRef.current;
                    let color = '#1a1a1a';

                    if (mode === 'div') {
                        const absdiv = Math.min(Math.abs(cell.div) * 100, 1);
                        const r = Math.floor(128 - absdiv * 127);
                        const b = Math.floor(128 + absdiv * 127);
                        color = `rgb(${r}, 50, ${b})`; // blue means divergence is positive, red means divergence is negative
                    } else if (mode === 'vel') {
                        // Sample velocity at cell center
                        const cx = i + 0.5;
                        const cy = j + 0.5;
                        const vx = sampleVX(cx, cy);
                        const vy = sampleVY(cx, cy);
                        const speed = Math.sqrt(vx * vx + vy * vy);

                        // Map speed to color (black -> blue -> cyan -> white)
                        const val = Math.min(speed * 0.5, 1); // sensitive to small speeds
                        const r = Math.floor(26 + val * 200);
                        const g = Math.floor(26 + val * 200);
                        const b = Math.floor(26 + val * 229);
                        color = `rgb(${r}, ${g}, ${b})`;
                    } else if (mode === 'smoke') {
                        const smoke = sampleSmoke(i + 0.5, j + 0.5);
                        // ${smoke.t}
                        color = `rgba(${smoke.r}, ${smoke.g}, ${smoke.b}, 1)`;
                    }

                    ctx.fillStyle = color;
                    const cellX = i * CELL_SIZE;
                    const cellY = j * CELL_SIZE;
                    ctx.fillRect(cellX, cellY, CELL_SIZE, CELL_SIZE);


                    if (arrowSubpointsRef.current > 0) {
                        const subpoints = arrowSubpointsRef.current;
                        for (let ii = 0; ii < subpoints; ii++) {
                            for (let jj = 0; jj < subpoints; jj++) {
                                // Position in pixel coordinates
                                const px = i * CELL_SIZE + (ii + 0.5) / subpoints * CELL_SIZE;
                                const py = j * CELL_SIZE + (jj + 0.5) / subpoints * CELL_SIZE;

                                // Convert to cell units for interpolation
                                const cellX = px / CELL_SIZE;
                                const cellY = py / CELL_SIZE;

                                // Use shared interpolation functions
                                const vx = sampleVX(cellX, cellY);
                                const vy = sampleVY(cellX, cellY);

                                // Draw velocity arrow
                                const arrowScale = CELL_SIZE * 0.5;
                                ctx.strokeStyle = '#4488ff';
                                ctx.lineWidth = 1;
                                ctx.beginPath();
                                ctx.moveTo(px, py);
                                ctx.lineTo(px + vx * arrowScale, py + vy * arrowScale);
                                ctx.stroke();
                            }
                        }
                    }
                }
            }

            // Draw grid lines
            if (gridLinesRef.current) {
                for (let i = 0; i <= COLS; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * CELL_SIZE, 0);
                    ctx.lineTo(i * CELL_SIZE, height);
                    ctx.stroke();
                }

                for (let i = 0; i <= ROWS; i++) {
                    ctx.beginPath();
                    ctx.moveTo(0, i * CELL_SIZE);
                    ctx.lineTo(width, i * CELL_SIZE);
                    ctx.stroke();
                }
            }

            // Draw brush cursor
            if (isMouseOverRef.current) {
                const { x, y } = hoverPosRef.current;
                const radius = 2 * CELL_SIZE; // Matches the brush radius (2 cells)

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Optional: fill slightly
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fill();
            }

            requestAnimationFrame(render);
        };

        const animId = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animId);
    }, []);

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            background: '#1a1a1a',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <canvas
                ref={canvasRef}
                width={COLS * CELL_SIZE}
                height={ROWS * CELL_SIZE}
                style={{ display: 'block', cursor: 'none' }} // Hide default cursor for better immersion
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => {
                    handleMouseUp();
                    isMouseOverRef.current = false;
                }}
            />

            <button
                onClick={onWin}
                style={{
                    position: 'absolute',
                    top: 24,
                    right: 24,
                    padding: '12px 24px',
                    background: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    zIndex: 100
                }}
            >
                Skip
            </button>

            <button
                onClick={randomize}
                style={{
                    position: 'absolute',
                    top: 96,
                    right: 24,
                    padding: '12px 24px',
                    background: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    zIndex: 100
                }}
            >
                Randomize
            </button>

            <select
                onChange={changeBrushMode}
                value={brushMode}
                style={{
                    position: 'absolute',
                    top: 144, // Between random(96) and arrows(192)
                    right: 24,
                    padding: '12px 24px',
                    background: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    zIndex: 100
                }}
            >
                <option value="vel">Brush: Velocity</option>
                <option value="smoke">Brush: Smoke</option>
            </select>

            <select
                onChange={changeArrowMode}
                value={arrowSubpoints}
                style={{
                    position: 'absolute',
                    top: 192,
                    right: 24,
                    padding: '12px 24px',
                    background: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    zIndex: 100
                }}
            >
                <option value="0">No Arrows</option>
                <option value="4">4x4 Arrows</option>
                <option value="10">10x10 Arrows</option>
            </select>

            <select
                onChange={changeRenderMode}
                value={renderMode}
                style={{
                    position: 'absolute',
                    top: 284,
                    right: 24,
                    padding: '12px 24px',
                    background: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    zIndex: 100
                }}
            >
                <option value="div">Divergence</option>
                <option value="vel">Velocity</option>
                <option value="smoke">Smoke</option>
                Render Mode
            </select>

            <select
                onChange={changeGridMode}
                value={gridLines ? 'on' : 'off'}
                style={{
                    position: 'absolute',
                    top: 376, // Adjusted position to sit between arrows and render mode
                    right: 24,
                    padding: '12px 24px',
                    background: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    zIndex: 100
                }}
            >
                <option value="on">Grid On</option>
                <option value="off">Grid Off</option>
            </select>

            <div style={{
                position: 'absolute',
                top: 468,
                right: 24,
                width: 200,
                background: '#fff',
                padding: '12px',
                borderRadius: 8,
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
            }}>
                <label style={{ fontSize: '14px', fontFamily: 'monospace' }}>
                    Decay: {velocityDecay.toFixed(4)}
                </label>
                <input
                    type="range"
                    min="0.0000"
                    max="1.0000"
                    step="0.001"
                    value={velocityDecay}
                    onChange={handleVelocityDecayChange}
                />
            </div>

            <div style={{
                position: 'absolute',
                top: 560, right: 24, width: 200, background: '#fff', padding: '12px', borderRadius: 8, zIndex: 100, display: 'flex',
                flexDirection: 'column',
                gap: 8
            }}>
                <label style={{ fontSize: '14px', fontFamily: 'monospace' }}>
                    Diffusion Rate: {smokeDiffusionRate.toFixed(4)}
                </label>
                <input
                    type="range"
                    min="0.0000"
                    max="1.0"
                    step="0.0001"
                    value={smokeDiffusionRate}
                    onChange={handleSmokeDiffusionRateChange}
                />
            </div>
        </div>
    );
};
