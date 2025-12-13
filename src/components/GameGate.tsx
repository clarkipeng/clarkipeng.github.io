import { useState, useEffect, useRef } from 'react';

interface FluidConfig {
    velocityDecay?: number;
    smokeDiffusion?: number;
}

interface GameGateProps {
    onWin?: () => void;
    onNextImage?: () => void;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    className?: string;
    backgroundColor?: string;
    showUI?: boolean;
    initialImage?: string;
    initialCaption?: string;
    defaultBrushMode?: 'vel' | 'smoke' | 'havoc';
    config?: FluidConfig;
}

export const GameGate = ({
    onWin = () => { },
    onNextImage,
    width,
    height,
    style,
    className,
    backgroundColor = '#1a1a1a',
    showUI = true,
    initialImage,
    initialCaption,
    defaultBrushMode = 'vel',
    config = {}
}: GameGateProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Interaction state
    const isMouseDownRef = useRef(false);
    const lastMousePosRef = useRef({ x: 0, y: 0 }); // for delta calculation
    const hoverPosRef = useRef({ x: 0, y: 0 }); // for visualization
    const isMouseOverRef = useRef(false);

    const [arrowIndicator, setArrowIndicator] = useState("off"); // false = off, true = subpoints
    const arrowIndicatorRef = useRef(false);
    const changeArrowMode = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setArrowIndicator(e.target.value);
        arrowIndicatorRef.current = e.target.value == 'on';
    };
    const [brushMode, setBrushMode] = useState(defaultBrushMode);
    const brushModeRef = useRef(defaultBrushMode);
    const changeBrushMode = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as 'vel' | 'smoke' | 'havoc';
        setBrushMode(val);
        brushModeRef.current = val;
    };
    const [gridLines, setGridLines] = useState(false);
    const gridLinesRef = useRef(false);
    const changeGridMode = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value === 'off';
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

    const [velocityDecay, setVelocityDecay] = useState(config.velocityDecay ?? 0.9);
    const velocityDecayRef = useRef(config.velocityDecay ?? 0.9);
    const handleVelocityDecayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVelocityDecay(val);
        velocityDecayRef.current = val;
    };

    const [smokeDiffusionRate, setSmokeDiffusionRate] = useState(config.smokeDiffusion ?? 0.0);
    const smokeDiffusionRateRef = useRef(config.smokeDiffusion ?? 0.0);
    const handleSmokeDiffusionRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setSmokeDiffusionRate(val);
        smokeDiffusionRateRef.current = val;
    };

    const MINRES = 130;
    const UPSCALE = 2;

    const OMEGA = 1.7;
    const BRUSH_FORCE = 1.0;
    const SMOKE_TEMP = 100;
    const AMBIENT_TEMP = 20;
    const NOISE_STRENGTH = 10;
    const GRAVITY = 1;
    const BUOYANCY_FACTOR_TEMP = 0.1;
    const BUOYANCY_FACTOR_SMOKE = 0.0;//0.002;

    // Dynamic grid state
    const targetWidth = width || window.innerWidth;
    const targetHeight = height || window.innerHeight;
    const calcCellSize = Math.floor(Math.min(targetWidth, targetHeight) / MINRES);

    const gridSizeRef = useRef({
        cols: Math.ceil(targetWidth / calcCellSize),
        rows: Math.ceil(targetHeight / calcCellSize),
        cellSize: calcCellSize,
    });
    const [gridDimensions, setGridDimensions] = useState(gridSizeRef.current);

    const boardRef = useRef<any[][]>([]);
    const velocityXRef = useRef<number[][]>([]);
    const velocityYRef = useRef<number[][]>([]);
    const tempVelocityXRef = useRef<number[][]>([]);
    const tempVelocityYRef = useRef<number[][]>([]);
    const tempSmokeRef = useRef<any[][]>([]);

    const initGrid = (cols: number, rows: number) => {
        gridSizeRef.current.cols = cols;
        gridSizeRef.current.rows = rows;

        boardRef.current = Array(cols).fill(0).map(() =>
            Array(rows).fill(0).map(() => ({ color: '#1a1a1a', smoke: { r: 0, g: 0, b: 0, t: AMBIENT_TEMP }, div: 0, isSolid: false }))
        );
        // Walls
        for (let i = 0; i < cols; i++) {
            boardRef.current[i][0].isSolid = true;
            boardRef.current[i][rows - 1].isSolid = true;
        }
        for (let j = 0; j < rows; j++) {
            boardRef.current[0][j].isSolid = true;
            boardRef.current[cols - 1][j].isSolid = true;
        }

        velocityXRef.current = Array(cols - 1).fill(0).map(() => Array(rows).fill(0).map(() => 0));
        velocityYRef.current = Array(cols).fill(0).map(() => Array(rows - 1).fill(0).map(() => 0));
        tempVelocityXRef.current = Array(cols - 1).fill(0).map(() => Array(rows).fill(0));
        tempVelocityYRef.current = Array(cols).fill(0).map(() => Array(rows - 1).fill(0));
        tempSmokeRef.current = Array(cols).fill(0).map(() => Array(rows).fill(0).map(() => ({ r: 0, g: 0, b: 0, t: 0 })));

        if (canvasRef.current) {
            canvasRef.current.width = cols * gridSizeRef.current.cellSize;
            canvasRef.current.height = rows * gridSizeRef.current.cellSize;
        }
        setGridDimensions({ cols, rows, cellSize: gridSizeRef.current.cellSize });
    };

    const randomize = () => {
        const board = boardRef.current;
        const velocityX = velocityXRef.current;
        const velocityY = velocityYRef.current;

        for (let i = 1; i < gridSizeRef.current.cols - 1; i++) {
            for (let j = 1; j < gridSizeRef.current.rows - 1; j++) {
                if (board[i][j].isSolid) continue;
                if (i < gridSizeRef.current.cols - 1) velocityX[i][j] = Math.random() * 2 - 1;
                if (j < gridSizeRef.current.rows - 1) velocityY[i][j] = Math.random() * 2 - 1;
                board[i][j].smoke = { r: Math.random() * 64, g: Math.random() * 64, b: Math.random() * 64, t: AMBIENT_TEMP };
            }
        }
    };

    // Initial init & Resize
    useEffect(() => {
        if (width && height) {
            const sz = Math.floor(Math.min(width, height) / MINRES);
            gridSizeRef.current.cellSize = sz;
            const c = Math.ceil(width / sz);
            const r = Math.ceil(height / sz);
            initGrid(c, r);
        } else {
            initGrid(gridSizeRef.current.cols, gridSizeRef.current.rows);
        }
    }, [width, height]);

    // Shared image loading logic (with optional caption rendered as smoke text)
    const loadImageToGrid = (img: HTMLImageElement, caption?: string) => {
        const containerW = width || window.innerWidth;
        const containerH = height || window.innerHeight;
        const cs = gridSizeRef.current.cellSize;
        const maxCols = Math.floor(containerW / cs);
        const maxRows = Math.floor(containerH / cs);

        let w = img.width, h = img.height;
        const scale = Math.min(maxCols / w, maxRows / h);
        w = Math.floor(w * scale);
        h = Math.floor(h * scale);
        initGrid(w, h);

        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);

            // Draw caption text on top of image
            if (caption) {
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#ffffffff';
                ctx.lineWidth = 0;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.font = `20px "Space Grotesk"`;
                ctx.strokeText(caption, w / 2, h - 10);
                ctx.fillText(caption, w / 2, h - 10);
            }

            const data = ctx.getImageData(0, 0, w, h).data;
            const board = boardRef.current;
            for (let j = 0; j < h; j++) {
                for (let i = 0; i < w; i++) {
                    if (i > 0 && i < w - 1 && j > 0 && j < h - 1) {
                        const idx = (j * w + i) * 4;
                        board[i][j].smoke = { r: data[idx], g: data[idx + 1], b: data[idx + 2], t: AMBIENT_TEMP };
                    }
                }
            }
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => loadImageToGrid(img);
        img.src = URL.createObjectURL(file);
    };

    // Render text to grid as smoke
    const loadTextToGrid = (text: string) => {
        const containerW = width || window.innerWidth;
        const containerH = height || window.innerHeight;
        const cs = gridSizeRef.current.cellSize;
        const maxCols = Math.floor(containerW / cs);
        const maxRows = Math.floor(containerH / cs);

        // Use fixed grid dimensions for text
        const w = maxCols;
        const h = maxRows;
        initGrid(w, h);

        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);

            // Draw text
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `14px "Space Grotesk"`;
            ctx.fillText(text, w / 2, h / 2);

            const data = ctx.getImageData(0, 0, w, h).data;
            const board = boardRef.current;
            for (let j = 0; j < h; j++) {
                for (let i = 0; i < w; i++) {
                    if (i > 0 && i < w - 1 && j > 0 && j < h - 1) {
                        const idx = (j * w + i) * 4;
                        const brightness = data[idx];
                        if (brightness > 50) {
                            board[i][j].smoke = { r: 255, g: 255, b: 255, t: SMOKE_TEMP };
                            board[i][j].isSolid = true;
                        }
                    }
                }
            }
        }
    };

    useEffect(() => {
        if (initialImage) {
            // Load image with optional caption overlay
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => loadImageToGrid(img, initialCaption);
            img.src = initialImage;
        } else if (initialCaption) {
            // Text-only mode (no image)
            loadTextToGrid(initialCaption);
        }
    }, [initialImage, initialCaption]);

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

        const i0 = Math.max(0, Math.min(i, gridSizeRef.current.cols - 2));
        const i1 = Math.max(0, Math.min(i + 1, gridSizeRef.current.cols - 2));
        const j0 = Math.max(0, Math.min(j, gridSizeRef.current.rows - 1));
        const j1 = Math.max(0, Math.min(j + 1, gridSizeRef.current.rows - 1));

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

        const i0 = Math.max(0, Math.min(i, gridSizeRef.current.cols - 1));
        const i1 = Math.max(0, Math.min(i + 1, gridSizeRef.current.cols - 1));
        const j0 = Math.max(0, Math.min(j, gridSizeRef.current.rows - 2));
        const j1 = Math.max(0, Math.min(j + 1, gridSizeRef.current.rows - 2));

        return (1 - fx) * (1 - fy) * velocityY[i0][j0] +
            fx * (1 - fy) * velocityY[i1][j0] +
            (1 - fx) * fy * velocityY[i0][j1] +
            fx * fy * velocityY[i1][j1];
    };

    const sampleSmoke = (x: number, y: number): { r: number; g: number; b: number; t: number } => {
        const smoke = boardRef.current;
        const cols = gridSizeRef.current.cols;
        const rows = gridSizeRef.current.rows;

        const sx = x - 0.5;
        const sy = y - 0.5;
        const i = Math.floor(sx);
        const j = Math.floor(sy);
        const fx = sx - i;
        const fy = sy - j;

        const i0 = Math.max(0, Math.min(i, cols - 1));
        const i1 = Math.max(0, Math.min(i + 1, cols - 1));
        const j0 = Math.max(0, Math.min(j, rows - 1));
        const j1 = Math.max(0, Math.min(j + 1, rows - 1));

        // Safety check - verify cells exist
        if (!smoke[i0]?.[j0] || !smoke[i1]?.[j0] || !smoke[i0]?.[j1] || !smoke[i1]?.[j1]) {
            return { r: 0, g: 0, b: 0, t: AMBIENT_TEMP };
        }

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
        const radius = 2;
        const Xmin = Math.max(0, Math.floor(Math.min(x, lastX) / gridSizeRef.current.cellSize) - radius);
        const Xmax = Math.min(gridSizeRef.current.cols - 2, Math.floor(Math.max(x, lastX) / gridSizeRef.current.cellSize + radius));
        const Ymin = Math.max(0, Math.floor(Math.min(y, lastY) / gridSizeRef.current.cellSize) - radius);
        const Ymax = Math.min(gridSizeRef.current.rows - 2, Math.floor(Math.max(y, lastY) / gridSizeRef.current.cellSize + radius));

        for (let cx = Xmin; cx <= Xmax; cx++) {
            for (let cy = Ymin; cy <= Ymax; cy++) {

                if (boardRef.current[cx][cy].isSolid) continue;

                const CS = gridSizeRef.current.cellSize;
                const lenSq = dx * dx + dy * dy;
                const u = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (((cx + 0.5) * CS - lastX) * dx + ((cy + 0.5) * CS - lastY) * dy) / lenSq));
                const destX = lastX + u * dx;
                const destY = lastY + u * dy;
                const distSq = ((cx + 0.5) * CS - destX) ** 2 + ((cy + 0.5) * CS - destY) ** 2;

                if (distSq < (radius * CS) ** 2) {
                    const falloff = Math.exp(-distSq / ((radius * CS) ** 2));
                    const force = BRUSH_FORCE * falloff;

                    if (brushModeRef.current === 'vel') {
                        velocityXRef.current[cx][cy] += dx * force;
                        velocityYRef.current[cx][cy] += dy * force;
                    } else if (brushModeRef.current === 'smoke') {
                        const smoke = boardRef.current[cx][cy].smoke;
                        smoke.r = 255;
                        smoke.g = 255;
                        smoke.b = 255;
                        smoke.t = SMOKE_TEMP;
                    }
                }
            }
        }
    };

    // Physics Loop
    useEffect(() => {
        let lastTime = performance.now();

        const physics = () => {
            const cols = gridSizeRef.current.cols;
            const rows = gridSizeRef.current.rows;

            const board = boardRef.current;
            const velocityX = velocityXRef.current;
            const velocityY = velocityYRef.current;

            // Don't run physics until board is initialized
            if (!board || board.length === 0 || !velocityX.length || !velocityY.length) {
                requestAnimationFrame(physics);
                return;
            }

            const now = performance.now();
            const dt = Math.min((now - lastTime) / 1000, 0.1); // clamp to avoid instability
            lastTime = now;

            const vel_decay = dt * velocityDecayRef.current;//Math.exp(dt * Math.log(velocityDecayRef.current));
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
            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    // smoke calculation
                    const x = i + 0.5;
                    const y = j + 0.5;
                    const vx = sampleVX(x, y);
                    const vy = sampleVY(x, y);
                    const prevX = x - vx * dt;
                    const prevY = y - vy * dt;
                    newSmoke[i][j] = sampleSmoke(prevX, prevY);

                    // Position of this velocity sample in cell units
                    if (i < cols - 1) {
                        const x = i + 0.5;
                        const y = j;

                        const vx = sampleVX(x, y);
                        const vy = sampleVY(x, y);
                        const prevX = x - vx * dt;
                        const prevY = y - vy * dt;

                        let additional = 0;
                        if (brushModeRef.current == "havoc") {
                            additional += (Math.random() * 2 - 1) * NOISE_STRENGTH * dt;
                        }
                        newVelocityX[i][j] = sampleVX(prevX, prevY) + additional;
                    }
                    if (j < rows - 1) {
                        const x = i;
                        const y = j + 0.5;

                        const vx = sampleVX(x, y);
                        const vy = sampleVY(x, y);
                        const prevX = x - vx * dt;
                        const prevY = y - vy * dt;

                        const s = sampleSmoke(prevX, prevY);

                        const reltemp = s.t - AMBIENT_TEMP;
                        const smoke_conc = s.r + s.g + s.b;
                        const buoyancy = (-BUOYANCY_FACTOR_TEMP * reltemp + BUOYANCY_FACTOR_SMOKE * smoke_conc) * GRAVITY;

                        let additional = buoyancy * dt
                        if (brushModeRef.current == "havoc") {
                            additional += (Math.random() * 2 - 1) * NOISE_STRENGTH * dt;
                        }
                        newVelocityY[i][j] = sampleVY(prevX, prevY) + additional;
                    }

                }
            }
            // Copy new velocities back
            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    const cell = board[i][j];
                    const prevSolid = cell.isSolid;
                    if (i < cols - 1) {
                        velocityX[i][j] = (1 - vel_decay) * newVelocityX[i][j];

                        const rightSolid = board[i + 1][j].isSolid;
                        if (prevSolid || rightSolid) velocityX[i][j] = 0;
                    }
                    if (j < rows - 1) {
                        velocityY[i][j] = (1 - vel_decay) * newVelocityY[i][j];

                        const bottomSolid = board[i][j + 1].isSolid;
                        if (prevSolid || bottomSolid) velocityY[i][j] = 0;
                    }

                    if (prevSolid) continue;

                    //diffuse smoke from neighbors 
                    let laplacian = { r: 0, g: 0, b: 0, t: 0 }
                    let tot = 0
                    if (!board[i - 1][j].isSolid) {
                        laplacian.r += newSmoke[i - 1][j].r;
                        laplacian.g += newSmoke[i - 1][j].g;
                        laplacian.b += newSmoke[i - 1][j].b;
                        laplacian.t += newSmoke[i - 1][j].t;
                        tot++;
                    }
                    if (!board[i + 1][j].isSolid) {
                        laplacian.r += newSmoke[i + 1][j].r;
                        laplacian.g += newSmoke[i + 1][j].g;
                        laplacian.b += newSmoke[i + 1][j].b;
                        laplacian.t += newSmoke[i + 1][j].t;
                        tot++;
                    }
                    if (!board[i][j - 1].isSolid) {
                        laplacian.r += newSmoke[i][j - 1].r;
                        laplacian.g += newSmoke[i][j - 1].g;
                        laplacian.b += newSmoke[i][j - 1].b;
                        laplacian.t += newSmoke[i][j - 1].t;
                        tot++;
                    }
                    if (!board[i][j + 1].isSolid) {
                        laplacian.r += newSmoke[i][j + 1].r;
                        laplacian.g += newSmoke[i][j + 1].g;
                        laplacian.b += newSmoke[i][j + 1].b;
                        laplacian.t += newSmoke[i][j + 1].t;
                        tot++;
                    }
                    cell.smoke = {
                        r: newSmoke[i][j].r + (laplacian.r / tot - newSmoke[i][j].r) * diffuse_rate,
                        g: newSmoke[i][j].g + (laplacian.g / tot - newSmoke[i][j].g) * diffuse_rate,
                        b: newSmoke[i][j].b + (laplacian.b / tot - newSmoke[i][j].b) * diffuse_rate,
                        t: newSmoke[i][j].t + (laplacian.t / tot - newSmoke[i][j].t) * diffuse_rate
                    };
                }
            }
            // === PRESSURE SOLVE ===
            for (let iter = 0; iter < 10; iter++) {
                for (let i = 1; i < cols - 1; i++) {
                    for (let j = 1; j < rows - 1; j++) {
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
                        if (!board[i + 1][j].isSolid && i < cols - 1) velocityX[i][j] += p;
                        if (!board[i][j - 1].isSolid && j > 0) velocityY[i][j - 1] -= p;
                        if (!board[i][j + 1].isSolid && j < rows - 1) velocityY[i][j] += p;

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

        const render = () => {
            const cols = gridSizeRef.current.cols;
            const rows = gridSizeRef.current.rows;
            const cellSize = gridSizeRef.current.cellSize;
            const pixelWidth = cols * cellSize;
            const pixelHeight = rows * cellSize;
            const board = boardRef.current;
            const mode = renderModeRef.current;

            // Create or reuse ImageData
            const imageData = ctx.createImageData(pixelWidth, pixelHeight);
            const data = imageData.data;

            // Parse background color to RGB
            const bgR = parseInt(backgroundColor.slice(1, 3), 16) || 26;
            const bgG = parseInt(backgroundColor.slice(3, 5), 16) || 26;
            const bgB = parseInt(backgroundColor.slice(5, 7), 16) || 26;

            // Fill pixels
            const upscaleCols = cols * UPSCALE;
            const upscaleRows = rows * UPSCALE;
            const drawSize = cellSize / UPSCALE;

            for (let up_i = 0; up_i < upscaleCols; up_i++) {
                for (let up_j = 0; up_j < upscaleRows; up_j++) {
                    const i = Math.floor(up_i / UPSCALE);
                    const j = Math.floor(up_j / UPSCALE);

                    if (i >= cols || j >= rows) continue;

                    const cell = board[i][j];
                    let r = bgR, g = bgG, b = bgB;

                    if (!cell.isSolid) {
                        const cx = (up_i + 0.5) / UPSCALE;
                        const cy = (up_j + 0.5) / UPSCALE;

                        if (mode === 'div') {
                            const absdiv = Math.min(Math.abs(cell.div) * 100, 1);
                            r = Math.floor(128 - absdiv * 127);
                            g = 50;
                            b = Math.floor(128 + absdiv * 127);
                        } else if (mode === 'vel') {
                            const vx = sampleVX(cx, cy);
                            const vy = sampleVY(cx, cy);
                            const speed = Math.sqrt(vx * vx + vy * vy);
                            const val = Math.min(speed * 0.01, 1);
                            r = Math.floor(26 + val * 200);
                            g = Math.floor(26 + val * 200);
                            b = Math.floor(26 + val * 229);
                        } else if (mode === 'smoke') {
                            const smoke = sampleSmoke(cx, cy);
                            r = Math.floor(smoke.r);
                            g = Math.floor(smoke.g);
                            b = Math.floor(smoke.b);
                        }
                    }

                    // Fill the sub-pixel block
                    const startPixelX = Math.floor(up_i * drawSize);
                    const startPixelY = Math.floor(up_j * drawSize);
                    const endPixelX = Math.floor((up_i + 1) * drawSize);
                    const endPixelY = Math.floor((up_j + 1) * drawSize);

                    for (let px = startPixelX; px < endPixelX; px++) {
                        for (let py = startPixelY; py < endPixelY; py++) {
                            const idx = (py * pixelWidth + px) * 4;
                            data[idx] = r;
                            data[idx + 1] = g;
                            data[idx + 2] = b;
                            data[idx + 3] = 255;
                        }
                    }
                }
            }
            ctx.putImageData(imageData, 0, 0);

            // Draw Arrows (Normal Grid)
            if (arrowIndicatorRef.current) {
                const arrowScale = gridSizeRef.current.cellSize * 0.5;

                for (let i = 0; i < gridSizeRef.current.cols; i++) {
                    for (let j = 0; j < gridSizeRef.current.rows; j++) {
                        if (board[i][j].isSolid) continue;

                        // Position in pixel coordinates (center of cell)
                        const px = (i + 0.5) * gridSizeRef.current.cellSize;
                        const py = (j + 0.5) * gridSizeRef.current.cellSize;

                        // Cell units
                        const cellX = i + 0.5;
                        const cellY = j + 0.5;

                        const vx = sampleVX(cellX, cellY);
                        const vy = sampleVY(cellX, cellY);

                        ctx.strokeStyle = '#4488ff';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                        ctx.lineTo(px + vx * arrowScale, py + vy * arrowScale);
                        ctx.stroke();
                    }
                }
            }

            // Draw grid lines
            if (gridLinesRef.current) {
                for (let i = 0; i <= gridSizeRef.current.cols; i++) {
                    ctx.beginPath();
                    ctx.moveTo(i * gridSizeRef.current.cellSize, 0);
                    ctx.lineTo(i * gridSizeRef.current.cellSize, pixelHeight);
                    ctx.stroke();
                }
                for (let i = 0; i <= gridSizeRef.current.rows; i++) {
                    ctx.beginPath();
                    ctx.moveTo(0, i * gridSizeRef.current.cellSize);
                    ctx.lineTo(pixelWidth, i * gridSizeRef.current.cellSize);
                    ctx.stroke();
                }
            }

            requestAnimationFrame(render);
        };

        const animId = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animId);
    }, []);

    return (
        <div
            className={className}
            style={{
                width: width || '100vw',
                height: height || '100vh',
                background: backgroundColor,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...style
            }}>
            <canvas
                ref={canvasRef}
                width={gridDimensions.cols * gridDimensions.cellSize}
                height={gridDimensions.rows * gridDimensions.cellSize}
                style={{ display: 'block', cursor: 'crosshair' }}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => {
                    handleMouseUp();
                    isMouseOverRef.current = false;
                }}
            />

            {!showUI && (
                <div className="absolute bottom-4 right-4 flex gap-2 z-50">
                    {/* Custom icon dropdown for brush mode */}
                    <div className="relative group">
                        <button
                            className="w-10 h-10 rounded-lg flex items-center justify-center
                                       bg-gray-100 dark:bg-gray-800 
                                       hover:bg-gray-200 dark:hover:bg-gray-700
                                       transition-all duration-200
                                       border border-gray-200 dark:border-gray-600"
                            aria-label="Brush Mode"
                        >
                            {brushMode === 'vel' && (
                                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            )}
                            {brushMode === 'smoke' && (
                                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                </svg>
                            )}
                            {brushMode === 'havoc' && (
                                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                                </svg>
                            )}
                        </button>
                        {/* Dropdown menu - appears on hover */}
                        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:flex flex-col gap-1
                                        bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 p-1">
                            <button
                                onClick={() => { setBrushMode('vel'); brushModeRef.current = 'vel'; }}
                                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors
                                           ${brushMode === 'vel' ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </button>
                            <button
                                onClick={() => { setBrushMode('smoke'); brushModeRef.current = 'smoke'; }}
                                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors
                                           ${brushMode === 'smoke' ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => { setBrushMode('havoc'); brushModeRef.current = 'havoc'; }}
                                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors
                                           ${brushMode === 'havoc' ? 'bg-cyan-100 dark:bg-cyan-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    {onNextImage && (
                        <button
                            onClick={onNextImage}
                            className="w-10 h-10 rounded-lg flex items-center justify-center
                                       bg-gray-100 dark:bg-gray-800 
                                       hover:bg-gray-200 dark:hover:bg-gray-700
                                       transition-all duration-200
                                       border border-gray-200 dark:border-gray-600"
                            aria-label="Next Image"
                        >
                            {/* Shuffle/refresh icon */}
                            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    )}
                </div>
            )}

            {showUI && <>
                <button onClick={onWin} style={{ position: 'absolute', top: 24, right: 24, padding: '12px 24px', background: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', zIndex: 100 }}>Skip</button>
                <button onClick={randomize} style={{ position: 'absolute', top: 96, right: 24, padding: '12px 24px', background: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', zIndex: 100 }}>Randomize</button>
                <select onChange={changeBrushMode} value={brushMode} style={{ position: 'absolute', top: 144, right: 24, padding: '12px 24px', background: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', zIndex: 100 }}>
                    <option value="vel">Brush: Velocity</option>
                    <option value="smoke">Brush: Smoke</option>
                </select>
                <select onChange={changeArrowMode} value={arrowIndicator} style={{ position: 'absolute', top: 192, right: 24, padding: '12px 24px', background: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', zIndex: 100 }}>
                    <option value="off">Arrows Off</option>
                    <option value="on">Arrows On</option>
                </select>
                <select onChange={changeRenderMode} value={renderMode} style={{ position: 'absolute', top: 284, right: 24, padding: '12px 24px', background: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', zIndex: 100 }}>
                    <option value="div">Divergence</option>
                    <option value="vel">Velocity</option>
                    <option value="smoke">Smoke</option>
                </select>
                <select onChange={changeGridMode} value={gridLines ? 'on' : 'off'} style={{ position: 'absolute', top: 376, right: 24, padding: '12px 24px', background: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', zIndex: 100 }}>
                    <option value="on">Grid On</option>
                    <option value="off">Grid Off</option>
                </select>
                <div style={{ position: 'absolute', top: 360, left: 24, zIndex: 100 }}>
                    <label style={{ padding: '8px 16px', background: '#fff', borderRadius: 8, cursor: 'pointer', display: 'inline-block', fontFamily: 'monospace', fontSize: '14px' }}>
                        Upload Image
                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                    </label>
                </div>
                <div style={{ position: 'absolute', top: 468, right: 24, width: 200, background: '#fff', padding: '12px', borderRadius: 8, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontSize: '14px', fontFamily: 'monospace' }}>Decay: {velocityDecay.toFixed(4)}</label>
                    <input type="range" min="0" max="1" step="0.001" value={velocityDecay} onChange={handleVelocityDecayChange} />
                </div>
                <div style={{ position: 'absolute', top: 560, right: 24, width: 200, background: '#fff', padding: '12px', borderRadius: 8, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontSize: '14px', fontFamily: 'monospace' }}>Diffusion: {smokeDiffusionRate.toFixed(4)}</label>
                    <input type="range" min="0" max="1" step="0.0001" value={smokeDiffusionRate} onChange={handleSmokeDiffusionRateChange} />
                </div>
            </>}
        </div>
    );
};
