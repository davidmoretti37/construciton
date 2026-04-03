'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { useRef, useCallback, Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';

const SCREEN_MESH_NAME = 'xXDHkMplTIDAXLN';
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

useGLTF.preload('/iphone.glb');

function Phone({ mouse }: { mouse: React.RefObject<{ x: number; y: number }> }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene: originalScene } = useGLTF('/iphone.glb', '/draco/');
  const scene = useMemo(() => originalScene.clone(), [originalScene]);
  const targetRotation = useRef({ x: 0, y: Math.PI });

  // Make the screen white so the overlaid HTML content is visible
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name === SCREEN_MESH_NAME) {
        child.material = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      }
    });
  }, [scene]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const m = mouse.current!;

    targetRotation.current.y = Math.PI + m.x * 0.25;
    targetRotation.current.x = -m.y * 0.12;

    groupRef.current.rotation.y = lerp(
      groupRef.current.rotation.y,
      targetRotation.current.y + Math.sin(t * 0.4) * 0.02,
      0.06
    );
    groupRef.current.rotation.x = lerp(
      groupRef.current.rotation.x,
      targetRotation.current.x + Math.sin(t * 0.3) * 0.015,
      0.06
    );
    groupRef.current.position.y = lerp(
      groupRef.current.position.y,
      Math.sin(t * 0.6) * 0.05,
      0.05
    );
  });

  return (
    <group ref={groupRef} scale={22} position={[0, 0, 0]} rotation={[0, Math.PI, 0]}>
      <primitive object={scene} />
    </group>
  );
}

export default function PhoneMockup3DInner({ children }: { children: React.ReactNode }) {
  const mouseRef = useRef({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.x = 0;
    mouseRef.current.y = 0;
  }, []);

  return (
    <div
      className="relative w-full aspect-[9/16]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* 3D phone model */}
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        className="!touch-none absolute inset-0"
        style={{ background: 'none' }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, alpha: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.domElement.style.background = 'transparent';
        }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <directionalLight position={[-3, 2, 4]} intensity={0.4} />
        <Suspense fallback={null}>
          <Phone mouse={mouseRef} />
        </Suspense>
      </Canvas>

      {/* Animated content overlaid on the screen area */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="w-[52%] h-[70%] mt-[2%] overflow-hidden">
          <div className="px-3 pt-2 h-full overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
