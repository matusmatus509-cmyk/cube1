import * as THREE from 'three';
import { RubiksCube } from './RubiksCube';
import { MoveType } from './CubeState';

interface PointerState {
  down: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  onCube: boolean;
  hitPoint: THREE.Vector3 | null;
  hitNormal: THREE.Vector3 | null;
  hitCubiePos: THREE.Vector3 | null;
  cubeGroupRotating: boolean;
}

export class CubeInteraction {
  private cube: RubiksCube;
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;
  private renderer: THREE.WebGLRenderer;
  private cubeGroup: THREE.Group;
  private pointer: PointerState;
  private threshold = 7;

  constructor(
    cube: RubiksCube,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    cubeGroup: THREE.Group
  ) {
    this.cube = cube;
    this.camera = camera;
    this.renderer = renderer;
    this.cubeGroup = cubeGroup;
    this.raycaster = new THREE.Raycaster();
    this.pointer = {
      down: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      onCube: false,
      hitPoint: null,
      hitNormal: null,
      hitCubiePos: null,
      cubeGroupRotating: false,
    };
    this.bindEvents();
  }

  private getNDC(x: number, y: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    );
  }

  private getIntersection(x: number, y: number): THREE.Intersection | null {
    const ndc = this.getNDC(x, y);
    this.raycaster.setFromCamera(ndc, this.camera);

    const meshes: THREE.Object3D[] = [];
    this.cubeGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshes.push(obj);
      }
    });

    const intersects = this.raycaster.intersectObjects(meshes, false);
    // Find sticker (plane) intersections first, then box
    return intersects.length > 0 ? intersects[0] : null;
  }

  private getPointerPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    if (e instanceof TouchEvent) {
      const touch = e.touches[0] ?? e.changedTouches[0];
      return { x: touch.clientX, y: touch.clientY };
    }
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  }

  private onPointerDown = (e: MouseEvent | TouchEvent) => {
    const { x, y } = this.getPointerPos(e);
    const hit = this.getIntersection(x, y);

    this.pointer.down = true;
    this.pointer.startX = x;
    this.pointer.startY = y;
    this.pointer.lastX = x;
    this.pointer.lastY = y;
    this.pointer.onCube = !!hit;
    this.pointer.cubeGroupRotating = false;
    this.pointer.hitPoint = null;
    this.pointer.hitNormal = null;
    this.pointer.hitCubiePos = null;

    if (hit) {
      // Store the face normal and cubie position in cube-local space
      const face = hit.face;
      if (face) {
        // Normal in object (cubie) space
        const objNormal = face.normal.clone();
        // Transform to world space via the parent group (the cubie group)
        const cubieGroup = hit.object.parent as THREE.Group;
        if (cubieGroup) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(cubieGroup.matrixWorld);
          objNormal.applyMatrix3(normalMatrix).normalize();

          // Transform normal to cubeGroup local space
          const cubeInv = new THREE.Matrix3().getNormalMatrix(this.cubeGroup.matrixWorld);
          const cubeNormal = objNormal.clone().applyMatrix3(cubeInv).normalize();
          this.pointer.hitNormal = cubeNormal;

          // Get cubie position in cubeGroup local space
          const worldPos = new THREE.Vector3();
          cubieGroup.getWorldPosition(worldPos);
          const cubeMatrix = this.cubeGroup.matrixWorld.clone().invert();
          worldPos.applyMatrix4(cubeMatrix);
          this.pointer.hitCubiePos = new THREE.Vector3(
            Math.round(worldPos.x / 1.05),
            Math.round(worldPos.y / 1.05),
            Math.round(worldPos.z / 1.05)
          );
        }
      }
    }
  };

  private onPointerMove = (e: MouseEvent | TouchEvent) => {
    if (!this.pointer.down) return;
    if (e instanceof TouchEvent) e.preventDefault();

    const { x, y } = this.getPointerPos(e);
    const dx = x - this.pointer.startX;
    const dy = y - this.pointer.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.threshold) return;

    if (!this.pointer.onCube) {
      // Rotate whole cube
      this.pointer.cubeGroupRotating = true;
      const movX = x - this.pointer.lastX;
      const movY = y - this.pointer.lastY;
      this.cubeGroup.rotation.y += movX * 0.009;
      this.cubeGroup.rotation.x += movY * 0.009;
      this.pointer.lastX = x;
      this.pointer.lastY = y;
    }
  };

  private onPointerUp = (e: MouseEvent | TouchEvent) => {
    if (!this.pointer.down) return;

    const { x, y } = e instanceof TouchEvent
      ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
      : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };

    const dx = x - this.pointer.startX;
    const dy = y - this.pointer.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.pointer.onCube && dist >= this.threshold && !this.pointer.cubeGroupRotating) {
      this.handleSwipe(dx, dy);
    }

    this.pointer.down = false;
    this.pointer.cubeGroupRotating = false;
  };

  private handleSwipe(dx: number, dy: number) {
    const normal = this.pointer.hitNormal;
    const cubiePos = this.pointer.hitCubiePos;
    if (!normal || !cubiePos) return;

    const move = this.determineMoveFromFaceAndSwipe(normal, dx, dy, cubiePos);
    if (move) {
      this.cube.executeMove(move);
    }
  }

  private determineMoveFromFaceAndSwipe(
    normal: THREE.Vector3,
    dx: number, dy: number,
    cubie: THREE.Vector3
  ): MoveType | null {
    const cx = cubie.x;
    const cy = cubie.y;
    const cz = cubie.z;

    const absNX = Math.abs(normal.x);
    const absNY = Math.abs(normal.y);
    const absNZ = Math.abs(normal.z);

    const horizontal = Math.abs(dx) > Math.abs(dy);

    if (absNY >= absNX && absNY >= absNZ) {
      // Top or Bottom face
      if (normal.y > 0) {
        // Top (U face)
        if (horizontal) {
          const dir = dx > 0 ? 1 : -1;
          if (cz <= -1) return dir > 0 ? 'U' : "U'";
          if (cz === 0) return dir > 0 ? 'E' : "E'";
          return dir > 0 ? 'D' : "D'";
        } else {
          const dir = dy > 0 ? 1 : -1;
          if (cx <= -1) return dir > 0 ? 'L' : "L'";
          if (cx === 0) return dir > 0 ? 'M' : "M'";
          return dir > 0 ? 'R' : "R'";
        }
      } else {
        // Bottom (D face)
        if (horizontal) {
          const dir = dx > 0 ? 1 : -1;
          if (cz >= 1) return dir > 0 ? "D'" : 'D';
          if (cz === 0) return dir > 0 ? "E'" : 'E';
          return dir > 0 ? "U'" : 'U';
        } else {
          const dir = dy > 0 ? 1 : -1;
          if (cx <= -1) return dir > 0 ? "L'" : 'L';
          if (cx === 0) return dir > 0 ? "M'" : 'M';
          return dir > 0 ? "R'" : 'R';
        }
      }
    } else if (absNZ >= absNX && absNZ >= absNY) {
      // Front or Back face
      if (normal.z > 0) {
        // Front (F face)
        if (horizontal) {
          const dir = dx > 0 ? 1 : -1;
          if (cy >= 1) return dir > 0 ? 'U' : "U'";
          if (cy === 0) return dir > 0 ? 'E' : "E'";
          return dir > 0 ? 'D' : "D'";
        } else {
          const dir = dy > 0 ? 1 : -1;
          if (cx >= 1) return dir > 0 ? 'R' : "R'";
          if (cx === 0) return dir > 0 ? 'M' : "M'";
          return dir > 0 ? 'L' : "L'";
        }
      } else {
        // Back (B face)
        if (horizontal) {
          const dir = dx > 0 ? 1 : -1;
          if (cy >= 1) return dir > 0 ? "U'" : 'U';
          if (cy === 0) return dir > 0 ? "E'" : 'E';
          return dir > 0 ? "D'" : 'D';
        } else {
          const dir = dy > 0 ? 1 : -1;
          if (cx >= 1) return dir > 0 ? "R'" : 'R';
          if (cx === 0) return dir > 0 ? "M'" : 'M';
          return dir > 0 ? "L'" : 'L';
        }
      }
    } else {
      // Left or Right face
      if (normal.x > 0) {
        // Right (R face)
        if (horizontal) {
          const dir = dx > 0 ? 1 : -1;
          if (cy >= 1) return dir > 0 ? 'U' : "U'";
          if (cy === 0) return dir > 0 ? 'E' : "E'";
          return dir > 0 ? 'D' : "D'";
        } else {
          const dir = dy > 0 ? 1 : -1;
          if (cz >= 1) return dir > 0 ? 'F' : "F'";
          if (cz === 0) return dir > 0 ? 'S' : "S'";
          return dir > 0 ? 'B' : "B'";
        }
      } else {
        // Left (L face)
        if (horizontal) {
          const dir = dx > 0 ? 1 : -1;
          if (cy >= 1) return dir > 0 ? "U'" : 'U';
          if (cy === 0) return dir > 0 ? "E'" : 'E';
          return dir > 0 ? "D'" : 'D';
        } else {
          const dir = dy > 0 ? 1 : -1;
          if (cz >= 1) return dir > 0 ? "F'" : 'F';
          if (cz === 0) return dir > 0 ? "S'" : 'S';
          return dir > 0 ? "B'" : 'B';
        }
      }
    }
  }

  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('mousedown', this.onPointerDown);
    el.addEventListener('mousemove', this.onPointerMove);
    el.addEventListener('mouseup', this.onPointerUp);
    el.addEventListener('touchstart', this.onPointerDown, { passive: true });
    el.addEventListener('touchmove', this.onPointerMove, { passive: false });
    el.addEventListener('touchend', this.onPointerUp, { passive: true });
  }

  destroy() {
    const el = this.renderer.domElement;
    el.removeEventListener('mousedown', this.onPointerDown);
    el.removeEventListener('mousemove', this.onPointerMove);
    el.removeEventListener('mouseup', this.onPointerUp);
    el.removeEventListener('touchstart', this.onPointerDown);
    el.removeEventListener('touchmove', this.onPointerMove);
    el.removeEventListener('touchend', this.onPointerUp);
  }
}
