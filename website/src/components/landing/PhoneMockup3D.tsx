'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { useRef, useEffect, Suspense, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import * as THREE from 'three';
import MagicRings from '@/components/ui/MagicRings';

const SCREEN_MESH_NAME = 'xXDHkMplTIDAXLN';
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

useGLTF.preload('/iphone.glb');

function Phone({ mouse }: { mouse: React.RefObject<{ x: number; y: number }> }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/iphone.glb', '/draco/');
  const screenTexture = useTexture('/mockup.png');
  const targetRotation = useRef({ x: 0, y: Math.PI });

  const screenMaterial = useMemo(() => {
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenTexture.flipY = true;
    return new THREE.MeshStandardMaterial({
      map: screenTexture,
      transparent: true,
      roughness: 0,
      metalness: 0,
    });
  }, [screenTexture]);

  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name === SCREEN_MESH_NAME) {
        child.material = screenMaterial;
      }
    });
  }, [scene, screenMaterial]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const m = mouse.current!;

    targetRotation.current.y = Math.PI + m.x * 0.3 - 0.1;
    targetRotation.current.x = -m.y * 0.15 + 0.05;

    groupRef.current.rotation.y = lerp(
      groupRef.current.rotation.y,
      targetRotation.current.y + Math.sin(t * 0.4) * 0.03,
      0.06
    );
    groupRef.current.rotation.x = lerp(
      groupRef.current.rotation.x,
      targetRotation.current.x + Math.sin(t * 0.3) * 0.02,
      0.06
    );
    groupRef.current.position.y = lerp(
      groupRef.current.position.y,
      0.2 + Math.sin(t * 0.6) * 0.08,
      0.05
    );
  });

  return (
    <group ref={groupRef} scale={22} position={[0, 0.2, 0]} rotation={[0, Math.PI, 0]}>
      <primitive object={scene} />
    </group>
  );
}

function FloatingCard({
  children,
  className,
  delay,
}: {
  children: React.ReactNode;
  className: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 15, delay }}
      className={`absolute card-elevated px-4 py-3 ${className}`}
    >
      {children}
    </motion.div>
  );
}

export default function PhoneMockup3D() {
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
      className="relative w-full h-[600px] sm:h-[700px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Magic rings behind the phone */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          maskImage: 'radial-gradient(ellipse 50% 50% at center, black 30%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse 50% 50% at center, black 30%, transparent 70%)',
        }}
      >
        <MagicRings
          color="#3b82f6"
          colorTwo="#06b6d4"
          ringCount={6}
          speed={0.8}
          attenuation={6}
          lineThickness={2.5}
          baseRadius={0.12}
          radiusStep={0.06}
          scaleRate={0.12}
          opacity={1}
          noiseAmount={0.04}
          ringGap={1.5}
          fadeIn={0.7}
          fadeOut={0.5}
          followMouse
          mouseInfluence={0.15}
          hoverScale={1.15}
          parallax={0.04}
          clickBurst
        />
      </div>

      {/* 3D phone model with texture */}
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        className="!touch-none relative z-[1]"
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

      {/* Floating cards */}
      <FloatingCard className="hidden sm:flex -left-4 top-20 items-center gap-2 z-10" delay={1.2}>
        <SparklesIcon className="h-4 w-4 text-amber-500" />
        <span className="text-xs text-gray-700 font-medium">Estimate sent!</span>
      </FloatingCard>

      <FloatingCard className="hidden sm:flex -right-4 top-40 items-center gap-2 z-10" delay={1.5}>
        <ChatBubbleLeftRightIcon className="h-4 w-4 text-blue-600" />
        <span className="text-xs text-gray-700 font-medium">AI: &ldquo;$12,450 total&rdquo;</span>
      </FloatingCard>

      <FloatingCard className="hidden sm:flex -left-0 bottom-32 items-center gap-2 z-10" delay={1.8}>
        <DocumentTextIcon className="h-4 w-4 text-emerald-500" />
        <span className="text-xs text-gray-700 font-medium">Invoice paid</span>
      </FloatingCard>
    </div>
  );
}
