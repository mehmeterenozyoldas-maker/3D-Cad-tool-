import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { useStore } from '../store';
import { generateFurniture, safeUnit, sampleBezier, serpentinize } from '../utils/geometry';

// Helper to create a watertight tube with caps
function createCappedTubeGeometry(curve: THREE.Curve<THREE.Vector3>, segments: number, radius: number, radialSegments: number): THREE.BufferGeometry {
    const tubeGeo = new THREE.TubeGeometry(curve, segments, radius, radialSegments, false);
    
    // We manually construct caps using the tube's own end vertices to ensure perfect matching
    const pos = tubeGeo.attributes.position;
    const vertsPerRing = radialSegments + 1;
    
    // 1. Calculate Centroids
    const startCenter = new THREE.Vector3();
    for(let i=0; i<radialSegments; i++) {
        startCenter.add(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    startCenter.divideScalar(radialSegments);
    
    const endCenter = new THREE.Vector3();
    const endStart = segments * vertsPerRing;
    for(let i=0; i<radialSegments; i++) {
        endCenter.add(new THREE.Vector3(pos.getX(endStart + i), pos.getY(endStart + i), pos.getZ(endStart + i)));
    }
    endCenter.divideScalar(radialSegments);
    
    // 2. Build Cap Geometry
    const capPositions: number[] = [];
    
    // Start Cap (Reverse winding for outward normal)
    for(let i=0; i<radialSegments; i++) {
        capPositions.push(startCenter.x, startCenter.y, startCenter.z);
        capPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        capPositions.push(pos.getX(i+1), pos.getY(i+1), pos.getZ(i+1));
    }
    
    // End Cap (Standard winding)
    for(let i=0; i<radialSegments; i++) {
        capPositions.push(endCenter.x, endCenter.y, endCenter.z);
        capPositions.push(pos.getX(endStart + i+1), pos.getY(endStart + i+1), pos.getZ(endStart + i+1));
        capPositions.push(pos.getX(endStart + i), pos.getY(endStart + i), pos.getZ(endStart + i));
    }
    
    const capsGeo = new THREE.BufferGeometry();
    capsGeo.setAttribute('position', new THREE.Float32BufferAttribute(capPositions, 3));
    capsGeo.computeVertexNormals();
    
    const tubeNonIndexed = tubeGeo.toNonIndexed();
    tubeNonIndexed.deleteAttribute('uv');
    tubeGeo.dispose();
    
    const merged = BufferGeometryUtils.mergeGeometries([tubeNonIndexed, capsGeo], false);
    tubeNonIndexed.dispose();
    capsGeo.dispose();
    
    if (!merged) {
        console.warn('Geometry merge failed, returning fallback.');
        return new THREE.BufferGeometry();
    }
    
    return merged;
}

const FurnitureModel = () => {
  const params = useStore();
  const groupRef = useRef<THREE.Group>(null);

  const { jointGeo, tubeGeo, coreGeo, ghostGeo, stats } = useMemo(() => {
    const data = generateFurniture(params.type, {
      width: params.width,
      height: params.height,
      depth: params.depth,
      seatHeight: params.seatHeight,
      pattern: params.pattern
    });

    const jointRadius = params.thickness * 1.6;
    let totalLen = 0;

    let freqMultiplier = 1.5;
    if (params.pattern === 'Gyroid') freqMultiplier = 2.0;
    if (params.pattern === 'Voronoi') freqMultiplier = 1.0;
    if (params.pattern === 'Triangular') freqMultiplier = 0.8;

    const tubeGeometries: THREE.BufferGeometry[] = [];
    const coreGeometries: THREE.BufferGeometry[] = [];
    const ghostGeometries: THREE.BufferGeometry[] = [];

    const baseCylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    baseCylinderGeo.translate(0, 0.5, 0);

    data.edges.forEach(([i, j]) => {
      const a = data.nodes[i];
      const b = data.nodes[j];
      const vec = b.clone().sub(a);
      const L = vec.length();
      if (L < 0.001) return;

      if (params.structuralCore) {
        const core = baseCylinderGeo.clone();
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
        m.compose(a, q, new THREE.Vector3(params.coreThickness, L, params.coreThickness));
        core.applyMatrix4(m);
        coreGeometries.push(core);
      }

      if (params.showGhost) {
        const ghost = new THREE.CylinderGeometry(0.003, 0.003, L, 4);
        ghost.rotateX(Math.PI/2);
        const m = new THREE.Matrix4();
        const pos = a.clone().addScaledVector(vec, 0.5);
        const dummy = new THREE.Object3D();
        dummy.position.copy(pos);
        dummy.lookAt(b);
        dummy.updateMatrix();
        ghost.applyMatrix4(dummy.matrix);
        ghostGeometries.push(ghost);
      }

      const offset = jointRadius * 0.8;
      const start = a.clone().addScaledVector(safeUnit(vec), offset);
      const end = b.clone().addScaledVector(safeUnit(vec), -offset);

      if (start.distanceTo(end) > 0.01) {
        const basePts = sampleBezier(start, start.clone().lerp(end, 0.33), start.clone().lerp(end, 0.66), end, params.segments);
        const freq = params.frequency * (L * freqMultiplier);
        const serpPts = serpentinize(basePts, freq, params.amplitude, params.taperLength);

        for(let k=0; k<serpPts.length-1; k++) {
            totalLen += serpPts[k].distanceTo(serpPts[k+1]);
        }

        const curve = new THREE.CatmullRomCurve3(serpPts);
        const tube = createCappedTubeGeometry(curve, params.segments, params.thickness, 6);
        tubeGeometries.push(tube);
      }
    });

    const jointGeometry = new THREE.SphereGeometry(jointRadius, 12, 12);
    const jointInstanced = new THREE.InstancedMesh(jointGeometry, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.1 }), data.nodes.length);
    jointInstanced.castShadow = true;
    jointInstanced.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    data.nodes.forEach((pos, i) => {
      dummy.position.copy(pos);
      dummy.updateMatrix();
      jointInstanced.setMatrixAt(i, dummy.matrix);
    });
    jointInstanced.instanceMatrix.needsUpdate = true;

    const mergedTubeGeo = tubeGeometries.length > 0 ? BufferGeometryUtils.mergeGeometries(tubeGeometries, false) : null;
    const mergedCoreGeo = coreGeometries.length > 0 ? BufferGeometryUtils.mergeGeometries(coreGeometries, false) : null;
    const mergedGhostGeo = ghostGeometries.length > 0 ? BufferGeometryUtils.mergeGeometries(ghostGeometries, false) : null;

    const radiusM = params.thickness;
    const volumeM3 = totalLen * Math.PI * (radiusM * radiusM);
    const volumeCm3 = volumeM3 * 1000000;
    const weightG = volumeCm3 * 1.24;
    const cost = (weightG / 1000) * 20.0;

    return {
      jointGeo: jointInstanced,
      tubeGeo: mergedTubeGeo,
      coreGeo: mergedCoreGeo,
      ghostGeo: mergedGhostGeo,
      stats: {
        filamentLength: totalLen,
        estWeight: weightG,
        estCost: cost
      }
    };
  }, [
    params.type, params.pattern, params.width, params.height, params.depth, 
    params.seatHeight, params.structuralCore, params.coreThickness, 
    params.showGhost, params.thickness, params.segments, params.frequency, 
    params.amplitude, params.taperLength
  ]);

  // Update stats in store
  useEffect(() => {
    params.setParams({
      filamentLength: stats.filamentLength,
      estWeight: stats.estWeight,
      estCost: stats.estCost
    });
  }, [stats.filamentLength, stats.estWeight, stats.estCost, params.setParams]);

  // Export STL listener
  useEffect(() => {
    const handleExport = () => {
      if (!groupRef.current) return;
      const exporter = new STLExporter();
      const exportGroup = new THREE.Group();

      // Safely scale vertices for export to avoid matrix issues
      const scaleMatrix = new THREE.Matrix4().makeScale(1000, 1000, 1000);

      if (tubeGeo) {
        const geo = tubeGeo.clone();
        geo.applyMatrix4(scaleMatrix);
        exportGroup.add(new THREE.Mesh(geo));
      }
      if (coreGeo) {
        const geo = coreGeo.clone();
        geo.applyMatrix4(scaleMatrix);
        exportGroup.add(new THREE.Mesh(geo));
      }

      // Bake joints
      const count = jointGeo.count;
      const tempMatrix = new THREE.Matrix4();
      const baseJointGeo = jointGeo.geometry.clone();
      baseJointGeo.applyMatrix4(scaleMatrix); // Scale base geometry

      for(let i=0; i<count; i++) {
          jointGeo.getMatrixAt(i, tempMatrix);
          const pos = new THREE.Vector3().setFromMatrixPosition(tempMatrix);
          pos.multiplyScalar(1000);
          const scaledMatrix = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z);

          const instance = new THREE.Mesh(baseJointGeo);
          instance.applyMatrix4(scaledMatrix);
          exportGroup.add(instance);
      }

      const result = exporter.parse(exportGroup, { binary: true });
      const blob = new Blob([result], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `furniture_${params.type.toLowerCase()}_${params.pattern.toLowerCase()}_${Date.now()}.stl`;
      link.click();
    };

    window.addEventListener('export-stl', handleExport);
    return () => window.removeEventListener('export-stl', handleExport);
  }, [tubeGeo, coreGeo, jointGeo, params.type, params.pattern]);

  return (
    <group ref={groupRef}>
      <primitive object={jointGeo} />
      {tubeGeo && (
        <mesh geometry={tubeGeo} castShadow receiveShadow>
          <meshStandardMaterial color={0xffa500} roughness={0.4} metalness={0.0} emissive={0xaa4400} emissiveIntensity={0.15} />
        </mesh>
      )}
      {coreGeo && (
        <mesh geometry={coreGeo} castShadow receiveShadow>
          <meshStandardMaterial color={0xcc6600} roughness={0.5} metalness={0.0} />
        </mesh>
      )}
      {ghostGeo && params.showGhost && (
        <mesh geometry={ghostGeo}>
          <meshBasicMaterial color={0xffffff} transparent opacity={0.1} depthTest={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};

const SensingScene: React.FC = () => {
  return (
    <Canvas shadows camera={{ position: [4.0, 3.5, 4.5], fov: 45 }} gl={{ antialias: true, alpha: false }} className="w-full h-full">
      <color attach="background" args={['#111111']} />
      <fog attach="fog" args={['#111111', 5, 20]} />

      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} />
      <directionalLight position={[-4, 3, -4]} intensity={0.4} color="#ffaa66" />

      <FurnitureModel />

      <Grid infiniteGrid fadeDistance={20} sectionColor="#333333" cellColor="#222222" position={[0, 0.001, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <shadowMaterial opacity={0.3} />
      </mesh>

      <OrbitControls makeDefault dampingFactor={0.06} target={[0, 0.5, 0]} />
    </Canvas>
  );
};

export default SensingScene;