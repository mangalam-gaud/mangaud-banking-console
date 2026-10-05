import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Ambient Three.js hero background for the sign-in / sign-up screens.
 *
 * Deliberately non-interactive and pointer-events-none: it sits behind the
 * auth card, never intercepts clicks, and pauses when not visible so it costs
 * nothing on the authenticated pages.
 *
 * The render loop is conditional rather than `frameloop="always"`, because a
 * permanently animating WebGL canvas is a real cost on a laptop that is also
 * running a dev server, and continuous motion is exactly what a user who has
 * asked for reduced motion does not want. Two conditions stop it:
 *
 *   - `prefers-reduced-motion: reduce` -> `demand`, which paints a single frame
 *     and then waits. The scene is still there; it just stops moving.
 *   - a hidden document (tab in the background, window minimised) -> `never`.
 *     There is nobody looking at it, and `requestAnimationFrame` does not fire
 *     for a background tab anyway, so this mainly releases the GPU context.
 */

/** True when the user has asked the OS to reduce motion. Reactive. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** False while the document is hidden. */
function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}

interface CoinProps {
  position: [number, number, number];
  scale: number;
  speed: number;
}

function Coin({ position, scale, speed }: CoinProps) {
  const mesh = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (mesh.current) {
      mesh.current.rotation.y += delta * speed;
      mesh.current.rotation.x += delta * speed * 0.35;
    }
  });

  return (
    <mesh ref={mesh} position={position} scale={scale} castShadow>
      <cylinderGeometry args={[1, 1, 0.12, 32]} />
      <meshStandardMaterial
        color="#f0b429"
        metalness={0.85}
        roughness={0.25}
        emissive="#b45309"
        emissiveIntensity={0.12}
      />
    </mesh>
  );
}

function Coins() {
  const coins = useMemo(
    () =>
      [
        { position: [-2.6, 1.1, -1.4] as [number, number, number], scale: 0.85, speed: 0.5 },
        { position: [2.9, 0.4, -2.2] as [number, number, number], scale: 1.15, speed: 0.35 },
        { position: [-1.5, -1.5, -3.1] as [number, number, number], scale: 0.6, speed: 0.7 },
        { position: [1.7, 2.2, -3.6] as [number, number, number], scale: 0.7, speed: 0.45 },
        { position: [3.6, -1.8, -1.1] as [number, number, number], scale: 0.5, speed: 0.8 },
      ],
    []
  );

  return (
    <>
      {coins.map((coin, i) => (
        <Float
          key={i}
          speed={1.4}
          rotationIntensity={0.35}
          floatIntensity={1.1}
          floatingRange={[-0.15, 0.15]}
        >
          <Coin {...coin} />
        </Float>
      ))}
    </>
  );
}

export function AuthScene() {
  const reducedMotion = usePrefersReducedMotion();
  const visible = useDocumentVisible();

  // 'never' when nobody can see it, 'demand' for a single still frame when the
  // user wants no motion, 'always' only when it is both visible and wanted.
  const frameloop = !visible ? 'never' : reducedMotion ? 'demand' : 'always';

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
      style={{ background: 'linear-gradient(160deg, #0b1220 0%, #10233f 55%, #0d1b2e 100%)' }}
    >
      <Canvas
        camera={{ position: [0, 0, 7], fov: 55 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        frameloop={frameloop}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 6, 5]} intensity={1.15} color="#ffffff" />
        <pointLight position={[-5, -3, 3]} intensity={0.7} color="#2563eb" />
        <pointLight position={[5, 2, -2]} intensity={0.55} color="#f0b429" />

        <Coins />

        <Environment preset="city" />
      </Canvas>
    </div>
  );
}

export default AuthScene;
