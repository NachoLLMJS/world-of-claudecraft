import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { IWorld } from '../world_api';
import type { FarmPlot } from '../sim/types';
import { terrainHeight } from '../sim/world';

const BASE = '/models/farm/fenze/';
const ASSETS = {
  fence: 'Fence',
  fence2: 'Fence2',
} as const;

type FarmAssetKey = keyof typeof ASSETS;

const templateCache = new Map<FarmAssetKey, THREE.Object3D>();
const loading = new Set<FarmAssetKey>();

function prep(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

function loadFarmAsset(key: FarmAssetKey, onReady: () => void): void {
  if (templateCache.has(key) || loading.has(key)) return;
  loading.add(key);
  const name = ASSETS[key];
  const mtl = new MTLLoader();
  mtl.setPath(BASE);
  mtl.load(`${name}.mtl`, (materials) => {
    materials.preload();
    const obj = new OBJLoader();
    obj.setMaterials(materials);
    obj.setPath(BASE);
    obj.load(`${name}.obj`, (root) => {
      prep(root);
      templateCache.set(key, root);
      loading.delete(key);
      onReady();
    }, undefined, () => loading.delete(key));
  }, undefined, () => loading.delete(key));
}

function addAsset(parent: THREE.Group, key: FarmAssetKey, x: number, z: number, rot: number, scale: number): void {
  const t = templateCache.get(key);
  if (!t) return;
  const o = t.clone(true);
  o.position.set(x, 0, z);
  o.rotation.y = rot;
  o.scale.setScalar(scale);
  parent.add(o);
}

function addBerryBush(parent: THREE.Group, x: number, z: number, seed: number): void {
  const bush = new THREE.Group();
  bush.position.set(x, 0, z);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7a31, roughness: 0.9 });
  const darkLeafMat = new THREE.MeshStandardMaterial({ color: 0x1e5b24, roughness: 0.95 });
  const berryMat = new THREE.MeshStandardMaterial({ color: 0xc72b3d, roughness: 0.55, metalness: 0.02 });

  for (let i = 0; i < 5; i++) {
    const a = i * 1.256 + seed * 0.37;
    const r = i === 0 ? 0 : 0.38 + (i % 2) * 0.12;
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.52 - i * 0.025, 10, 8),
      i % 2 ? leafMat : darkLeafMat,
    );
    crown.position.set(Math.cos(a) * r, 0.45 + (i % 3) * 0.08, Math.sin(a) * r);
    crown.scale.set(1.0, 0.72, 1.0);
    crown.castShadow = crown.receiveShadow = true;
    bush.add(crown);
  }

  for (let i = 0; i < 7; i++) {
    const a = seed * 0.91 + i * 2.399;
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), berryMat);
    berry.position.set(Math.cos(a) * (0.28 + (i % 3) * 0.12), 0.72 + (i % 2) * 0.12, Math.sin(a) * (0.28 + ((i + 1) % 3) * 0.12));
    berry.castShadow = true;
    bush.add(berry);
  }
  parent.add(bush);
}

function buildFallbackFence(parent: THREE.Group): void {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a572f, roughness: 0.9 });
  const pieces: [number, number, number, number, number][] = [
    [0, -3.4, 6.2, 0.14, 0.35], [0, 3.4, 6.2, 0.14, 0.35],
    [-3.4, 0, 0.14, 6.2, 0.35], [3.4, 0, 0.14, 6.2, 0.35],
  ];
  for (const [x, z, w, d, h] of pieces) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
    rail.position.set(x, 0.45, z);
    rail.castShadow = rail.receiveShadow = true;
    parent.add(rail);
  }
}

function buildBerryFarm(f: FarmPlot, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(f.x, terrainHeight(f.x, f.z, seed) + 0.02, f.z);
  g.rotation.y = f.facing;
  g.userData.farmId = f.id;

  // No suelo, no caseta: compact berry patch plus real side fences from the Fenze pack.
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) {
      addBerryBush(g, col * 1.45 + (row % 2) * 0.25, row * 1.35, seed + row * 17 + col * 31);
    }
  }

  buildFallbackFence(g);
  const fencePieces: [FarmAssetKey, number, number, number, number][] = [
    ['fence', 0, -3.4, 0, 1.0], ['fence', 0, 3.4, 0, 1.0],
    ['fence2', -3.4, 0, Math.PI / 2, 1.0], ['fence2', 3.4, 0, Math.PI / 2, 1.0],
  ];
  for (const [key, x, z, rot, scale] of fencePieces) addAsset(g, key, x, z, rot, scale);
  return g;
}

export class FarmsteadView {
  private group = new THREE.Group();
  private signature = '';
  private dirty = true;

  constructor(private scene: THREE.Scene, private world: IWorld, private seed: number) {
    this.group.name = 'player-berry-farms';
    this.scene.add(this.group);
    (Object.keys(ASSETS) as FarmAssetKey[]).forEach((key) => loadFarmAsset(key, () => { this.dirty = true; }));
  }

  update(): void {
    const sig = this.world.farms.map((f) => `${f.id}:${f.x.toFixed(1)}:${f.z.toFixed(1)}:${f.facing.toFixed(2)}`).join('|');
    if (!this.dirty && sig === this.signature) return;
    this.dirty = false;
    this.signature = sig;
    this.group.clear();
    for (const farm of this.world.farms) this.group.add(buildBerryFarm(farm, this.seed));
  }
}
