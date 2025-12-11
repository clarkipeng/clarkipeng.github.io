import { useEffect, useRef, useMemo, createContext, useContext, Suspense } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { Physics, RigidBody, BallCollider, TrimeshCollider } from '@react-three/rapier';
// @ts-ignore
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    camera: { baseDistance: 80 },
    gravity: { strength: 30, tiltSpeed: 0.8 },
    marble: { radius: 0.5, mass: 1, color: '#ff6688' },
    maze: {
        path: '/models/perplexus.stl',  // Using optimized version
        color: '#6644ff',
        scale: 12,
        offsetY: 8,
    },
    container: { radius: 28, opacity: 0.15, color: '#88ccff' },
    background: '#1a2838',
};

// ============================================================================
// CONTEXT
// ============================================================================
type Ctx = { tiltX: React.MutableRefObject<number>; tiltZ: React.MutableRefObject<number> };
const GameCtx = createContext<Ctx>(null!);

// ============================================================================
// SHARED STATE
// ============================================================================
const worldRotation = { current: new THREE.Quaternion() };
const ballPosition = { current: new THREE.Vector3(0, 10, 0) };

// ============================================================================
// KEYBOARD
// ============================================================================
const useKeys = () => {
    const k = useRef({ w: false, a: false, s: false, d: false });
    useEffect(() => {
        const dn = (e: KeyboardEvent) => { const key = e.key.toLowerCase(); if (key in k.current) k.current[key as keyof typeof k.current] = true; };
        const up = (e: KeyboardEvent) => { const key = e.key.toLowerCase(); if (key in k.current) k.current[key as keyof typeof k.current] = false; };
        window.addEventListener('keydown', dn);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
    }, []);
    return k;
};

// ============================================================================
// TILT CONTROLLER
// ============================================================================
const TiltController = () => {
    const keys = useKeys();
    const { tiltX, tiltZ } = useContext(GameCtx);

    useFrame((state, dt) => {
        const speed = CONFIG.gravity.tiltSpeed * dt;
        const camera = state.camera;

        const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

        const deltaQuat = new THREE.Quaternion();

        if (keys.current.w) deltaQuat.multiply(new THREE.Quaternion().setFromAxisAngle(cameraRight, speed));
        if (keys.current.s) deltaQuat.multiply(new THREE.Quaternion().setFromAxisAngle(cameraRight, -speed));
        if (keys.current.a) deltaQuat.multiply(new THREE.Quaternion().setFromAxisAngle(cameraDir, speed));
        if (keys.current.d) deltaQuat.multiply(new THREE.Quaternion().setFromAxisAngle(cameraDir, -speed));

        worldRotation.current.premultiply(deltaQuat);
        worldRotation.current.normalize();

        const gravityDir = new THREE.Vector3(0, -1, 0).applyQuaternion(worldRotation.current);
        tiltX.current = gravityDir.x;
        tiltZ.current = gravityDir.z;
    });
    return null;
};

// ============================================================================
// CAMERA (follows ball, fixed angle)
// ============================================================================
const Camera = () => {
    const { camera } = useThree();
    const zoom = useRef(1);

    useEffect(() => {
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            zoom.current = Math.max(0.4, Math.min(2, zoom.current + e.deltaY * 0.001));
        };
        window.addEventListener('wheel', wheel, { passive: false });
        return () => window.removeEventListener('wheel', wheel);
    }, []);

    useFrame(() => {
        const dist = CONFIG.camera.baseDistance * zoom.current;

        // Fixed offset behind and above the ball, rotated with world
        const offset = new THREE.Vector3(0, dist * 0.4, dist).applyQuaternion(worldRotation.current);
        const targetPos = ballPosition.current.clone().add(offset);

        // Up vector follows world rotation
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldRotation.current);

        camera.position.lerp(targetPos, 0.08);
        camera.up.lerp(up, 0.08);
        camera.lookAt(ballPosition.current);
    });
    return null;
};

// ============================================================================
// MOUSE GRAVITY CONTROLLER (drag to tilt gravity / "move" the ball)
// ============================================================================
const MouseGravityController = () => {
    const isDragging = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });
    const { camera } = useThree();

    useEffect(() => {
        const mouseDown = (e: MouseEvent) => {
            isDragging.current = true;
            lastMouse.current = { x: e.clientX, y: e.clientY };
        };

        const mouseUp = () => {
            isDragging.current = false;
        };

        const mouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;

            const dx = e.clientX - lastMouse.current.x;
            const dy = e.clientY - lastMouse.current.y;
            lastMouse.current = { x: e.clientX, y: e.clientY };

            // Get camera's right and forward directions
            const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

            // Tilt gravity based on mouse movement
            const speed = 0.003;
            const deltaQuat = new THREE.Quaternion();

            // Horizontal drag: rotate around camera's forward axis
            deltaQuat.multiply(new THREE.Quaternion().setFromAxisAngle(cameraDir, dx * speed));
            // Vertical drag: rotate around camera's right axis  
            deltaQuat.multiply(new THREE.Quaternion().setFromAxisAngle(cameraRight, dy * speed));

            worldRotation.current.premultiply(deltaQuat);
            worldRotation.current.normalize();
        };

        window.addEventListener('mousedown', mouseDown);
        window.addEventListener('mouseup', mouseUp);
        window.addEventListener('mousemove', mouseMove);

        return () => {
            window.removeEventListener('mousedown', mouseDown);
            window.removeEventListener('mouseup', mouseUp);
            window.removeEventListener('mousemove', mouseMove);
        };
    }, [camera]);

    return null;
};

// ============================================================================
// GRAVITY ARROW
// ============================================================================
const GravityArrow = () => {
    const arrowRef = useRef<THREE.Group>(null);

    useFrame(() => {
        if (!arrowRef.current) return;
        const gravityDir = new THREE.Vector3(0, -1, 0).applyQuaternion(worldRotation.current);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), gravityDir);
        arrowRef.current.quaternion.copy(quaternion);
    });

    return (
        <group ref={arrowRef}>
            <mesh position={[0, -5, 0]}>
                <cylinderGeometry args={[0.3, 0.3, 10, 8]} />
                <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
            </mesh>
            <mesh position={[0, -11, 0]}>
                <coneGeometry args={[1, 3, 8]} />
                <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
            </mesh>
        </group>
    );
};

// ============================================================================
// MARBLE (with Rapier physics)
// ============================================================================
const Marble = () => {
    const { radius, color } = CONFIG.marble;
    const rigidBodyRef = useRef<any>(null);

    useFrame((_, dt) => {
        if (!rigidBodyRef.current) return;

        // Track ball position for camera
        const pos = rigidBodyRef.current.translation();
        ballPosition.current.set(pos.x, pos.y, pos.z);

        // Get gravity direction and apply force (delta time independent)
        const gravityDir = new THREE.Vector3(0, -1, 0).applyQuaternion(worldRotation.current);
        const force = gravityDir.multiplyScalar(CONFIG.gravity.strength * dt);

        rigidBodyRef.current.applyImpulse({ x: force.x, y: force.y, z: force.z }, true);
    });

    return (
        <RigidBody ref={rigidBodyRef} position={[0, 10, 0]} colliders={false} linearDamping={0.5} angularDamping={0.5}>
            <BallCollider args={[radius]} />
            <mesh castShadow>
                <sphereGeometry args={[radius, 32, 32]} />
                <meshStandardMaterial color={color} roughness={0.3} metalness={0.6} />
            </mesh>
        </RigidBody>
    );
};

// ============================================================================
// CONTAINER (glass sphere with collision)
// ============================================================================
const Container = () => {
    const { radius, opacity, color } = CONFIG.container;

    // Create inverted sphere vertices for inside collision
    const { vertices, indices } = useMemo(() => {
        const geo = new THREE.SphereGeometry(radius, 24, 24);
        const positions = geo.attributes.position.array as Float32Array;

        // Negate vertices to flip normals inward
        const verts = new Float32Array(positions.length);
        for (let i = 0; i < positions.length; i++) {
            verts[i] = -positions[i];
        }

        // Reverse winding order
        const idx = geo.index!.array;
        const inds = new Uint32Array(idx.length);
        for (let i = 0; i < idx.length; i += 3) {
            inds[i] = idx[i];
            inds[i + 1] = idx[i + 2];
            inds[i + 2] = idx[i + 1];
        }

        return { vertices: verts, indices: inds };
    }, [radius]);

    return (
        <RigidBody type="fixed" colliders={false}>
            <TrimeshCollider args={[vertices, indices]} />
            <mesh>
                <sphereGeometry args={[radius, 48, 48]} />
                <meshStandardMaterial color={color} transparent opacity={opacity} side={THREE.BackSide} />
            </mesh>
        </RigidBody>
    );
};

// ============================================================================
// MAZE (with Rapier Trimesh collision)
// ============================================================================
const MazeContent = () => {
    const geo = useLoader(STLLoader, CONFIG.maze.path);

    const { vertices, indices, visualGeo } = useMemo(() => {
        const g = geo.clone();
        g.center();
        g.computeVertexNormals();

        const scale = CONFIG.maze.scale;
        const positions = g.attributes.position.array;

        // Scale vertices
        const verts = new Float32Array(positions.length);
        for (let i = 0; i < positions.length; i++) {
            verts[i] = positions[i] * scale;
        }

        // Get or generate indices
        let inds: Uint32Array;
        if (g.index) {
            const arr = g.index.array;
            inds = new Uint32Array(arr.length);
            for (let i = 0; i < arr.length; i++) inds[i] = arr[i];
        } else {
            inds = new Uint32Array(g.attributes.position.count);
            for (let i = 0; i < inds.length; i++) inds[i] = i;
        }

        // Visual geometry
        const visual = geo.clone();
        visual.center();
        visual.computeVertexNormals();
        visual.scale(scale, scale, scale);

        console.log(`Maze loaded: ${g.attributes.position.count} vertices, ${inds.length / 3} triangles`);

        return { vertices: verts, indices: inds, visualGeo: visual };
    }, [geo]);

    return (
        <RigidBody type="fixed" position={[0, 0, CONFIG.maze.offsetY]} colliders={false}>
            <TrimeshCollider args={[vertices, indices]} />
            <mesh geometry={visualGeo} castShadow receiveShadow>
                <meshStandardMaterial color={CONFIG.maze.color} roughness={0.4} metalness={0.5} side={THREE.DoubleSide} />
            </mesh>
        </RigidBody>
    );
};

const Maze = () => (
    <Suspense fallback={null}>
        <MazeContent />
    </Suspense>
);

// ============================================================================
// SCENE
// ============================================================================
const Scene = () => (
    <Physics gravity={[0, 0, 0]}>
        <TiltController />
        <Camera />
        <MouseGravityController />
        <GravityArrow />
        <Container />
        <Maze />
        <Marble />
    </Physics>
);

// ============================================================================
// MAIN
// ============================================================================
interface Props { onWin: () => void }

export const GameGate = ({ onWin }: Props) => {
    const tiltX = useRef(0);
    const tiltZ = useRef(0);

    return (
        <div style={{ width: '100vw', height: '100vh', background: CONFIG.background }}>
            <div style={{ position: 'absolute', top: 24, left: 24, color: '#fff', zIndex: 10 }}>
                <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>GRAVITY SHIFT</h2>
                <p style={{ margin: 4, opacity: 0.6 }}>WASD to tilt • Scroll to zoom</p>
            </div>

            <GameCtx.Provider value={{ tiltX, tiltZ }}>
                <Canvas shadows>
                    <color attach="background" args={[CONFIG.background]} />
                    <ambientLight intensity={0.5} />
                    <directionalLight position={[30, 40, 30]} intensity={1.5} castShadow />
                    <pointLight position={[-20, -20, -20]} intensity={0.3} color="#4488ff" />
                    <Scene />
                </Canvas>
            </GameCtx.Provider>

            <button onClick={onWin} style={{ position: 'absolute', top: 24, right: 24, padding: '12px 24px', background: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', zIndex: 100 }}>
                Skip
            </button>
        </div>
    );
};