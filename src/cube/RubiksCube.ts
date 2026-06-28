import * as THREE from 'three';
import { CubeStateData, FACE_COLORS, FaceColor, applyMove, MoveType } from './CubeState';

export const CUBIE_SIZE = 1;
export const GAP = 0.05;
export const TOTAL = CUBIE_SIZE + GAP;
const STICKER_SCALE = 0.86;
const STICKER_DEPTH = 0.005;
const ANIM_DURATION = 160; // ms

export interface Cubie {
  mesh: THREE.Group;
  logicalPos: THREE.Vector3; // grid coords: each component is -1, 0, or 1
}

export class RubiksCube {
  scene: THREE.Scene;
  cubeGroup: THREE.Group;
  cubies: Cubie[] = [];
  private isAnimating = false;
  private animQueue: Array<() => void> = [];
  private onStateChangeCb?: (state: CubeStateData) => void;
  private cubeState: CubeStateData;

  constructor(scene: THREE.Scene, cubeGroup: THREE.Group, initialState: CubeStateData) {
    this.scene = scene;
    this.cubeGroup = cubeGroup;
    this.cubeState = initialState;
    this.buildCube(initialState);
  }

  setOnStateChange(fn: (state: CubeStateData) => void) {
    this.onStateChangeCb = fn;
  }

  getState() {
    return this.cubeState;
  }

  private buildCube(state: CubeStateData) {
    this.cubies.forEach(c => this.cubeGroup.remove(c.mesh));
    this.cubies = [];

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const cubie = this.createCubie(x, y, z, state);
          this.cubies.push(cubie);
          this.cubeGroup.add(cubie.mesh);
        }
      }
    }
  }

  private getStickerColor(x: number, y: number, z: number, face: 'R' | 'L' | 'U' | 'D' | 'F' | 'B', state: CubeStateData): string {
    let row: number, col: number;
    switch (face) {
      case 'U': row = 1 - z; col = x + 1; return FACE_COLORS[state.U[row * 3 + col] as FaceColor];
      case 'D': row = z + 1; col = x + 1; return FACE_COLORS[state.D[row * 3 + col] as FaceColor];
      case 'F': row = 1 - y; col = x + 1; return FACE_COLORS[state.F[row * 3 + col] as FaceColor];
      case 'B': row = 1 - y; col = 1 - x; return FACE_COLORS[state.B[row * 3 + col] as FaceColor];
      case 'L': row = 1 - y; col = 1 - z; return FACE_COLORS[state.L[row * 3 + col] as FaceColor];
      case 'R': row = 1 - y; col = z + 1; return FACE_COLORS[state.R[row * 3 + col] as FaceColor];
    }
  }

  private createCubie(x: number, y: number, z: number, state: CubeStateData): Cubie {
    const group = new THREE.Group();
    group.position.set(x * TOTAL, y * TOTAL, z * TOTAL);

    // Black plastic body
    const baseGeo = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 20 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    group.add(baseMesh);

    const half = CUBIE_SIZE / 2 + STICKER_DEPTH;

    type FaceKey = 'R' | 'L' | 'U' | 'D' | 'F' | 'B';
    const faceConfigs: Array<{ face: FaceKey; condition: boolean; pos: [number,number,number]; rot: [number,number,number] }> = [
      { face: 'R', condition: x === 1,  pos: [half, 0, 0],   rot: [0, Math.PI/2, 0] },
      { face: 'L', condition: x === -1, pos: [-half, 0, 0],  rot: [0, -Math.PI/2, 0] },
      { face: 'U', condition: y === 1,  pos: [0, half, 0],   rot: [-Math.PI/2, 0, 0] },
      { face: 'D', condition: y === -1, pos: [0, -half, 0],  rot: [Math.PI/2, 0, 0] },
      { face: 'F', condition: z === 1,  pos: [0, 0, half],   rot: [0, 0, 0] },
      { face: 'B', condition: z === -1, pos: [0, 0, -half],  rot: [0, Math.PI, 0] },
    ];

    for (const { face, condition, pos, rot } of faceConfigs) {
      if (!condition) continue;
      const color = this.getStickerColor(x, y, z, face, state);
      const geo = new THREE.PlaneGeometry(STICKER_SCALE, STICKER_SCALE);
      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        shininess: 100,
        specular: new THREE.Color(0x888888),
      });
      const sticker = new THREE.Mesh(geo, mat);
      sticker.position.set(...pos);
      sticker.rotation.set(...rot);
      group.add(sticker);
    }

    return {
      mesh: group,
      logicalPos: new THREE.Vector3(x, y, z),
    };
  }

  private getCubiesInLayer(axis: 'x' | 'y' | 'z', value: number): Cubie[] {
    return this.cubies.filter(c => Math.round(c.logicalPos[axis]) === value);
  }

  private animateLayer(
    cubies: Cubie[],
    axisVec: THREE.Vector3,
    totalAngle: number,
    duration: number,
    onComplete: () => void
  ) {
    // Create a pivot group at the center of the cube group
    const pivot = new THREE.Group();
    this.cubeGroup.add(pivot);

    // Move cubies from cubeGroup to pivot, preserving local positions
    for (const cubie of cubies) {
      const localPos = cubie.mesh.position.clone();
      const localQuat = cubie.mesh.quaternion.clone();
      this.cubeGroup.remove(cubie.mesh);
      pivot.add(cubie.mesh);
      cubie.mesh.position.copy(localPos);
      cubie.mesh.quaternion.copy(localQuat);
    }

    const startTime = performance.now();
    const startQuat = new THREE.Quaternion();
    const targetQuat = new THREE.Quaternion().setFromAxisAngle(axisVec, totalAngle);

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      pivot.quaternion.slerpQuaternions(startQuat, targetQuat, eased);

      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }

      // Final snap: restore exact angle
      pivot.quaternion.copy(targetQuat);

      // Detach cubies from pivot back to cubeGroup
      for (const cubie of cubies) {
        // Get cubie position in pivot's local space
        const localPos = cubie.mesh.position.clone();
        const localQuat = cubie.mesh.quaternion.clone();

        // Transform position by pivot quaternion
        localPos.applyQuaternion(targetQuat);
        const combinedQuat = targetQuat.clone().multiply(localQuat);

        pivot.remove(cubie.mesh);
        this.cubeGroup.add(cubie.mesh);

        cubie.mesh.position.copy(localPos);
        cubie.mesh.quaternion.copy(combinedQuat);

        // Snap position to grid
        cubie.mesh.position.x = Math.round(cubie.mesh.position.x / TOTAL) * TOTAL;
        cubie.mesh.position.y = Math.round(cubie.mesh.position.y / TOTAL) * TOTAL;
        cubie.mesh.position.z = Math.round(cubie.mesh.position.z / TOTAL) * TOTAL;

        // Snap rotation to 90-degree increments
        const euler = new THREE.Euler().setFromQuaternion(cubie.mesh.quaternion, 'XYZ');
        euler.x = Math.round(euler.x / (Math.PI / 2)) * (Math.PI / 2);
        euler.y = Math.round(euler.y / (Math.PI / 2)) * (Math.PI / 2);
        euler.z = Math.round(euler.z / (Math.PI / 2)) * (Math.PI / 2);
        cubie.mesh.quaternion.setFromEuler(euler);
      }

      this.cubeGroup.remove(pivot);
      onComplete();
    };

    requestAnimationFrame(tick);
  }

  executeMove(move: MoveType, callback?: () => void) {
    type AxisKey = 'x' | 'y' | 'z';
    const moveMap: Record<MoveType, { axis: AxisKey; layer: number; dir: number }> = {
      'R':  { axis: 'x', layer:  1, dir: -1 },
      "R'": { axis: 'x', layer:  1, dir:  1 },
      'L':  { axis: 'x', layer: -1, dir:  1 },
      "L'": { axis: 'x', layer: -1, dir: -1 },
      'U':  { axis: 'y', layer:  1, dir: -1 },
      "U'": { axis: 'y', layer:  1, dir:  1 },
      'D':  { axis: 'y', layer: -1, dir:  1 },
      "D'": { axis: 'y', layer: -1, dir: -1 },
      'F':  { axis: 'z', layer:  1, dir: -1 },
      "F'": { axis: 'z', layer:  1, dir:  1 },
      'B':  { axis: 'z', layer: -1, dir:  1 },
      "B'": { axis: 'z', layer: -1, dir: -1 },
      'M':  { axis: 'x', layer:  0, dir:  1 },
      "M'": { axis: 'x', layer:  0, dir: -1 },
      'E':  { axis: 'y', layer:  0, dir:  1 },
      "E'": { axis: 'y', layer:  0, dir: -1 },
      'S':  { axis: 'z', layer:  0, dir: -1 },
      "S'": { axis: 'z', layer:  0, dir:  1 },
    };

    const doMove = () => {
      const { axis, layer, dir } = moveMap[move];
      const axisVec = new THREE.Vector3(
        axis === 'x' ? 1 : 0,
        axis === 'y' ? 1 : 0,
        axis === 'z' ? 1 : 0,
      );
      const angle = (Math.PI / 2) * dir;
      const cubies = this.getCubiesInLayer(axis, layer);

      // Update logical positions immediately (before animation)
      const q = new THREE.Quaternion().setFromAxisAngle(axisVec, angle);
      for (const cubie of cubies) {
        cubie.logicalPos.applyQuaternion(q);
        cubie.logicalPos.x = Math.round(cubie.logicalPos.x);
        cubie.logicalPos.y = Math.round(cubie.logicalPos.y);
        cubie.logicalPos.z = Math.round(cubie.logicalPos.z);
      }

      // Update cube state
      this.cubeState = applyMove(this.cubeState, move);
      this.isAnimating = true;

      this.animateLayer(cubies, axisVec, angle, ANIM_DURATION, () => {
        this.isAnimating = false;
        this.onStateChangeCb?.(this.cubeState);
        callback?.();
        if (this.animQueue.length > 0) {
          const next = this.animQueue.shift()!;
          next();
        }
      });
    };

    if (this.isAnimating) {
      this.animQueue.push(doMove);
    } else {
      doMove();
    }
  }

  setState(state: CubeStateData) {
    this.cubeState = { ...state };
    this.isAnimating = false;
    this.animQueue = [];
    this.buildCube(state);
  }

  isCurrentlyAnimating() {
    return this.isAnimating;
  }

  clearQueue() {
    this.animQueue = [];
  }
}
