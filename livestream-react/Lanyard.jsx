/* eslint-disable react/no-unknown-property */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, extend, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, Line, useGLTF, useTexture } from "@react-three/drei";
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useRopeJoint,
  useSphericalJoint,
} from "@react-three/rapier";
import { MeshLineGeometry, MeshLineMaterial } from "meshline";
import * as THREE from "three";
import "./Lanyard.css";

extend({ MeshLineGeometry, MeshLineMaterial });

const BLANK_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// The card model contains a baked atlas: the front occupies the left half,
// while the back occupies the right half. Keeping the original atlas means
// the metal edge and clip remain intact when a portrait is composited in.
const FRONT_UV_RECT = { x: 0, y: 0, w: 0.5, h: 0.755 };
const BACK_UV_RECT = { x: 0.5, y: 0, w: 0.5, h: 0.757 };
const cardGLB = "assets/react/card.glb?v=0.24-v59";
const lanyard = "assets/react/lanyard.png?v=0.24-v59";

function useCardMap({ materials, frontImage, backImage, imageFit, frontTex, backTex }) {
  return useMemo(() => {
    const baseMap = materials.base.map;
    if (!frontImage && !backImage) return baseMap;

    const baseImage = baseMap.image;
    if (!baseImage) return baseMap;

    const canvas = document.createElement("canvas");
    canvas.width = baseImage.width;
    canvas.height = baseImage.height;
    const context = canvas.getContext("2d");
    if (!context) return baseMap;
    context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

    const drawFitted = (image, rect) => {
      if (!image?.width || !image?.height) return;
      const rx = rect.x * canvas.width;
      const ry = rect.y * canvas.height;
      const rw = rect.w * canvas.width;
      const rh = rect.h * canvas.height;
      const scale = (imageFit === "contain" ? Math.min : Math.max)(
        rw / image.width,
        rh / image.height,
      );
      const width = image.width * scale;
      const height = image.height * scale;
      const x = rx + (rw - width) / 2;
      const y = ry + (rh - height) / 2;
      context.save();
      context.beginPath();
      context.rect(rx, ry, rw, rh);
      context.clip();
      context.drawImage(image, x, y, width, height);
      context.restore();
    };

    drawFitted(frontTex.image, FRONT_UV_RECT);
    drawFitted(backTex.image, BACK_UV_RECT);

    const composite = new THREE.CanvasTexture(canvas);
    composite.colorSpace = THREE.SRGBColorSpace;
    composite.flipY = baseMap.flipY;
    composite.anisotropy = 16;
    composite.needsUpdate = true;
    return composite;
  }, [backImage, backTex, frontImage, frontTex, imageFit, materials.base.map]);
}

function useArtwork({ frontImage, backImage, imageFit, materials }) {
  // These hooks stay unconditional so changing the image source never changes
  // the hook order inside either the desktop or mobile card scene.
  const frontTex = useTexture(frontImage || BLANK_PIXEL);
  const backTex = useTexture(backImage || BLANK_PIXEL);
  const cardMap = useCardMap({
    materials,
    frontImage,
    backImage,
    imageFit,
    frontTex,
    backTex,
  });
  return cardMap;
}

function CardMeshes({ nodes, materials, cardMap, interactive = false, onPointerDown, onPointerOut, onPointerOver, onPointerUp, scale = 2.25 }) {
  return (
    <group
      scale={scale}
      position={[0, -1.2, -0.05]}
      onPointerOver={interactive ? onPointerOver : undefined}
      onPointerOut={interactive ? onPointerOut : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
      onPointerDown={interactive ? onPointerDown : undefined}
    >
      <mesh geometry={nodes.card.geometry}>
        <meshPhysicalMaterial
          map={cardMap}
          map-anisotropy={16}
          clearcoat={interactive ? 1 : 0.45}
          clearcoatRoughness={0.15}
          roughness={0.9}
          metalness={0.8}
        />
      </mesh>
      <mesh geometry={nodes.clip.geometry} material={materials.metal} material-roughness={0.3} />
      <mesh geometry={nodes.clamp.geometry} material={materials.metal} />
    </group>
  );
}

function Band({
  frontImage,
  backImage,
  imageFit,
  lanyardImage,
  lanyardWidth,
  interactive,
}) {
  const band = useRef();
  const fixed = useRef();
  const j1 = useRef();
  const j2 = useRef();
  const j3 = useRef();
  const card = useRef();
  const vec = useMemo(() => new THREE.Vector3(), []);
  const ang = useMemo(() => new THREE.Vector3(), []);
  const rot = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const [dragged, setDragged] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [curve] = useState(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
  );
  const { nodes, materials } = useGLTF(cardGLB);
  const texture = useTexture(lanyardImage || lanyard);
  const cardMap = useArtwork({ frontImage, backImage, imageFit, materials });
  const segmentProps = {
    type: "dynamic",
    canSleep: true,
    colliders: false,
    angularDamping: 4,
    linearDamping: 4,
  };

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.5, 0]]);

  useEffect(() => {
    if (!hovered || !interactive) return undefined;
    document.body.style.cursor = dragged ? "grabbing" : "grab";
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [dragged, hovered, interactive]);

  useFrame((state, delta) => {
    if (!fixed.current || !card.current) return;
    if (interactive && dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp());
      card.current.setNextKinematicTranslation({
        x: vec.x - dragged.x,
        y: vec.y - dragged.y,
        z: vec.z - dragged.z,
      });
    }

    [j1, j2].forEach((ref) => {
      if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
      const distance = Math.max(
        0.1,
        Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())),
      );
      ref.current.lerped.lerp(ref.current.translation(), delta * (distance * 50));
    });
    curve.points[0].copy(j3.current.translation());
    curve.points[1].copy(j2.current.lerped);
    curve.points[2].copy(j1.current.lerped);
    curve.points[3].copy(fixed.current.translation());
    band.current.geometry.setPoints(curve.getPoints(32));
    ang.copy(card.current.angvel());
    rot.copy(card.current.rotation());
    card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
  });

  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return (
    <>
      <group position={[0, 4, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          position={[2, 0, 0]}
          ref={card}
          {...segmentProps}
          type={interactive && dragged ? "kinematicPosition" : "dynamic"}
        >
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <CardMeshes
            nodes={nodes}
            materials={materials}
            cardMap={cardMap}
            interactive={interactive}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onPointerUp={(event) => {
              event.target.releasePointerCapture(event.pointerId);
              setDragged(false);
            }}
            onPointerDown={(event) => {
              event.target.setPointerCapture(event.pointerId);
              setDragged(new THREE.Vector3().copy(event.point).sub(vec.copy(card.current.translation())));
            }}
          />
        </RigidBody>
      </group>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={[1000, 1000]}
          useMap
          map={texture}
          repeat={[-4, 1]}
          lineWidth={lanyardWidth}
        />
      </mesh>
    </>
  );
}

function MobileBand({ frontImage, backImage, imageFit, lanyardImage, lanyardWidth }) {
  const { nodes, materials } = useGLTF(cardGLB);
  const texture = useTexture(lanyardImage || lanyard);
  const cardMap = useArtwork({ frontImage, backImage, imageFit, materials });
  const linePoints = useMemo(
    () => [
      [-1.15, 4.8, 0],
      [-0.65, 4.15, 0],
      [-0.2, 3.55, 0],
      [0.2, 3.1, 0],
      [0.45, 2.75, 0],
    ],
    [],
  );

  useEffect(() => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  }, [texture]);

  return (
    <group position={[-1.1, 0.3, 0]} rotation={[0, 0, -0.02]}>
      <Line
        points={linePoints}
        color="white"
        lineWidth={lanyardWidth * 1.4}
        depthTest={false}
        dashed={false}
      />
      <group position={[0.45, 2.25, 0]} rotation={[0, 0, 0.035]}>
        <CardMeshes nodes={nodes} materials={materials} cardMap={cardMap} interactive={false} scale={2.1} />
      </group>
    </group>
  );
}

function ReadySignal({ onReady }) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return null;
}

export default function Lanyard({
  position = [0, 0, 22],
  cameraDistance,
  gravity = [0, -40, 0],
  fov = 20,
  transparent = true,
  frontImage = null,
  backImage = null,
  imageFit = "cover",
  lanyardImage = null,
  lanyardWidth = 1,
  active = false,
  onReady,
}) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="lanyard-wrapper">
      <Canvas
        className={`${isMobile ? "lanyard-scene lanyard-scene--mobile" : "lanyard-scene"}${active ? " is-lanyard-active" : ""}`}
        camera={{ position: cameraDistance ? [position[0], position[1], cameraDistance] : position, fov }}
        dpr={[1, isMobile ? 1.25 : 2]}
        frameloop={isMobile ? "demand" : "always"}
        gl={{ alpha: transparent, antialias: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color(0x000000), transparent ? 0 : 1);
        }}
      >
        <ambientLight intensity={Math.PI} />
        <Suspense fallback={null}>
          {isMobile ? (
            <MobileBand
              frontImage={frontImage}
              backImage={backImage}
              imageFit={imageFit}
              lanyardImage={lanyardImage}
              lanyardWidth={lanyardWidth}
            />
          ) : (
            <Physics key={active ? "lanyard-dropped" : "lanyard-held"} gravity={active ? gravity : [0, 0, 0]} timeStep={1 / 60}>
              <Band
                frontImage={frontImage}
                backImage={backImage}
                imageFit={imageFit}
                lanyardImage={lanyardImage}
                lanyardWidth={lanyardWidth}
                interactive={active}
              />
            </Physics>
          )}
          <Environment blur={0.75}>
            <Lightformer
              intensity={2}
              color="white"
              position={[0, -1, 5]}
              rotation={[0, 0, Math.PI / 3]}
              scale={[100, 0.1, 1]}
            />
            <Lightformer
              intensity={3}
              color="white"
              position={[-1, -1, 1]}
              rotation={[0, 0, Math.PI / 3]}
              scale={[100, 0.1, 1]}
            />
            <Lightformer
              intensity={3}
              color="white"
              position={[1, 1, 1]}
              rotation={[0, 0, Math.PI / 3]}
              scale={[100, 0.1, 1]}
            />
            <Lightformer
              intensity={10}
              color="white"
              position={[-10, 0, 14]}
              rotation={[0, Math.PI / 2, Math.PI / 3]}
              scale={[100, 10, 1]}
            />
          </Environment>
          <ReadySignal onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(cardGLB);
