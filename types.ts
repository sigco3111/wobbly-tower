
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export enum BlockShapeType {
  CUBE_S = 'CUBE_S',
  RECT_TALL = 'RECT_TALL',
  RECT_WIDE = 'RECT_WIDE',
  CYLINDER_S = 'CYLINDER_S',
}

export interface BlockDimensions {
  x: number; // For Box: half-width, Cylinder: radiusTop/radiusBottom
  y: number; // For Box: half-height, Cylinder: height
  z: number; // For Box: half-depth, Cylinder: segments (for constructor)
}

export interface BlockDefinition {
  type: BlockShapeType;
  dimensions: BlockDimensions; // Cannon uses half-extents for Box
  mass: number;
  color: number; // THREE.Color hex
  friction: number;
  restitution: number;
  name: string;
  shape: 'Box' | 'Cylinder'; // To distinguish geometry/shape creation
}

export interface PhysicsObject {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  id: string; // Unique ID for each block
  definition: BlockDefinition;
}