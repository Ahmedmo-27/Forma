import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function WeightPlate({ pointer }) {
  const group = useRef(null);
  const cream = useMemo(() => new THREE.Color("#fcf3e2"), []);
  const navy = useMemo(() => new THREE.Color("#142843"), []);
  const metal = useMemo(() => new THREE.Color("#1e3a5f"), []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += delta * 0.35;
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, pointer.current.y * 0.35, 4, delta);
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, pointer.current.x * -0.25, 4, delta);
    g.position.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.05;
  });

  return (
    <group ref={group} position={[0, 0, 0]} scale={1.02}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[1.15, 1.15, 0.18, 64]} />
        <meshStandardMaterial color={navy} metalness={0.72} roughness={0.28} />
      </mesh>
      <mesh castShadow position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.92, 0.92, 0.2, 64]} />
        <meshStandardMaterial color={cream} metalness={0.15} roughness={0.45} />
      </mesh>
      <mesh castShadow>
        <torusGeometry args={[1.18, 0.045, 16, 64]} />
        <meshStandardMaterial color={metal} metalness={0.85} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.42, 48]} />
        <meshStandardMaterial color={cream} metalness={0.2} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.28, 32]} />
        <meshStandardMaterial color={metal} metalness={0.8} roughness={0.25} />
      </mesh>
    </group>
  );
}

function Scene({ pointer }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 3]} intensity={1.15} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} color="#fcf3e2" />
      <WeightPlate pointer={pointer} />
      <ContactShadows position={[0, -1.15, 0]} opacity={0.35} scale={8} blur={2.6} far={4} />
    </>
  );
}

function StaticPlateFallback() {
  return (
    <div className="marketing-hero-3d-fallback" aria-hidden="true">
      <span className="marketing-hero-3d-disc" />
    </div>
  );
}

/**
 * Lightweight hero 3D accent: floating weight-plate disc.
 * Pauses when off-screen; static fallback under reduced motion.
 */
export default function HeroGymAccent() {
  const wrapRef = useRef(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [visible, setVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);

    const el = wrapRef.current;
    let observer;
    if (el && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        ([entry]) => setVisible(entry.isIntersecting),
        { threshold: 0.05 }
      );
      observer.observe(el);
    }

    return () => {
      mq.removeEventListener("change", onChange);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || reduceMotion) return;

    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      pointer.current.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.current.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    const onLeave = () => {
      pointer.current.x = 0;
      pointer.current.y = 0;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [reduceMotion]);

  return (
    <div className="marketing-hero-3d" ref={wrapRef} aria-hidden="true">
      {reduceMotion ? (
        <StaticPlateFallback />
      ) : (
        <Suspense fallback={<StaticPlateFallback />}>
          <Canvas
            dpr={[1, 1.5]}
            camera={{ position: [0, 0.15, 4.85], fov: 34 }}
            gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
            frameloop={visible ? "always" : "never"}
            style={{ width: "100%", height: "100%", background: "transparent" }}
          >
            <Scene pointer={pointer} />
          </Canvas>
        </Suspense>
      )}
    </div>
  );
}
