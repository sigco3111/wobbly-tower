import * as THREE from 'three';
import { BlockDefinition, BlockShapeType } from './types';

export const BLOCK_DEFINITIONS: Record<BlockShapeType, BlockDefinition> = {
  [BlockShapeType.CUBE_S]: {
    type: BlockShapeType.CUBE_S,
    dimensions: { x: 0.5, y: 0.5, z: 0.5 }, // Cannon Box uses half-extents
    mass: 1,
    color: 0xff6347, // Tomato
    friction: 0.8,
    restitution: 0.05,
    name: "작은 정육면체",
    shape: 'Box',
  },
  [BlockShapeType.RECT_TALL]: {
    type: BlockShapeType.RECT_TALL,
    dimensions: { x: 0.25, y: 1, z: 0.25 },
    mass: 1.5,
    color: 0x4682b4, // SteelBlue
    friction: 0.7,
    restitution: 0.05,
    name: "길쭉한 직육면체",
    shape: 'Box',
  },
  [BlockShapeType.RECT_WIDE]: {
    type: BlockShapeType.RECT_WIDE,
    dimensions: { x: 1, y: 0.25, z: 0.5 },
    mass: 2.5,
    color: 0x3cb371, // MediumSeaGreen
    friction: 0.9,
    restitution: 0.05,
    name: "넓은 직육면체",
    shape: 'Box',
  },
  [BlockShapeType.CYLINDER_S]: {
    type: BlockShapeType.CYLINDER_S,
    dimensions: { x: 0.4, y: 0.75, z: 16 }, // x: radiusTop/Bottom, y: height, z: segments
    mass: 1.2,
    color: 0xffd700, // Gold
    friction: 0.6,
    restitution: 0.1,
    name: "작은 원기둥",
    shape: 'Cylinder',
  }
};

export const GROUND_LEVEL = 0;
export const BLOCK_SPAWN_HEIGHT_OFFSET = 0.2; // Small gap above the highest block or ghost block preview
export const INITIAL_SPAWN_Y = 5; 
export const GAME_OVER_FALL_THRESHOLD_Y = -5; 
export const FALLEN_BLOCK_DOT_THRESHOLD = 0.5; // If dot product of block's up vector and world's up vector is less than this, it's considered fallen over (after 2+ blocks)


export const INITIAL_CAMERA_POSITION_VECTOR = new THREE.Vector3(5, 7, 10); 
export const INITIAL_CAMERA_LOOK_AT_VECTOR = new THREE.Vector3(0, 3, 0); 

export const GHOST_BLOCK_OPACITY = 0.5;
export const GHOST_BLOCK_X_MOVEMENT_STEP = 0.2; 
export const GHOST_BLOCK_ROTATION_STEP = Math.PI / 12; // 15 degrees 
export const GHOST_BLOCK_FINE_ROTATION_STEP = Math.PI / 36; // 5 degrees

export const CAMERA_MIN_ZOOM_DISTANCE = 3; // Reduced min zoom
export const CAMERA_MAX_ZOOM_DISTANCE = 35; // Increased max zoom
export const CAMERA_ZOOM_SPEED = 0.015; 

export const CAMERA_MIN_POLAR_ANGLE = THREE.MathUtils.degToRad(5); // Allow to look more from top
export const CAMERA_MAX_POLAR_ANGLE = THREE.MathUtils.degToRad(88); // Allow to look more from side
export const CAMERA_ROTATION_SPEED_X = 0.015; 
export const CAMERA_ROTATION_SPEED_Y = 0.015; 
export const CAMERA_PAN_SPEED = 0.3;

// Visual Feedback Constants
export const STABILITY_INDICATOR_COLOR_GREEN = new THREE.Color(0x00ff00);
export const STABILITY_INDICATOR_COLOR_YELLOW = new THREE.Color(0xffff00);
export const STABILITY_INDICATOR_COLOR_RED = new THREE.Color(0xff0000);
export const STABILITY_INDICATOR_OPACITY = 0.35;
export const STABILITY_INDICATOR_OFFSET_Y = 0.05; // Small gap below ghost block

// Thresholds for placement stability (factors of combined dimensions or radius)
// Lower factor means stricter (needs to be more centered)
export const PLACEMENT_STABILITY_GREEN_THRESHOLD_BOX = 0.4; 
export const PLACEMENT_STABILITY_YELLOW_THRESHOLD_BOX = 0.8;
export const PLACEMENT_STABILITY_GREEN_THRESHOLD_CYLINDER = 0.3;
export const PLACEMENT_STABILITY_YELLOW_THRESHOLD_CYLINDER = 0.7;


export const TOWER_INSTABILITY_WARNING_DOT_THRESHOLD = 0.866; // Approx 30 degrees tilt (cos(30deg))
export const TOWER_INSTABILITY_VIGNETTE_BASE_OPACITY = 0.1;
export const TOWER_INSTABILITY_VIGNETTE_OPACITY_PER_BLOCK = 0.15;
export const TOWER_INSTABILITY_VIGNETTE_MAX_OPACITY = 0.5;
export const TOWER_INSTABILITY_VIGNETTE_BASE_SPREAD = 20; // in px for box-shadow
export const TOWER_INSTABILITY_VIGNETTE_SPREAD_PER_BLOCK = 15; // in px
export const TOWER_INSTABILITY_VIGNETTE_MAX_SPREAD = 80; // in px
export const TOWER_INSTABILITY_BLOCK_COUNT_FOR_MAX_EFFECT = 3; // Number of unstable blocks to reach max effect

// Camera Presets
export const CAMERA_PRESET_FRONT = {
    phi: Math.PI / 2.5, // Angle from Y-axis (vertical)
    theta: Math.PI / 2, // Angle around Y-axis (horizontal), view from positive Z looking towards origin
    radius: 12,
    lookAtYFactor: 0.4, // lookAt.y will be currentHighestBlockY * this factor
    lookAtX: 0,
    lookAtZ: 0,
};
export const CAMERA_PRESET_TOP = {
    phi: 0.01, // Almost straight down
    theta: 0,
    radius: 18, // May need adjustment based on typical tower width
    lookAtY: GROUND_LEVEL + 1, // Look slightly above ground, effectively centering on the base area
    lookAtX: 0,
    lookAtZ: 0,
};
export const CAMERA_PRESET_SIDE = { // View from positive X looking towards origin
    phi: Math.PI / 2.5,
    theta: 0, 
    radius: 12,
    lookAtYFactor: 0.4,
    lookAtX: 0,
    lookAtZ: 0,
};