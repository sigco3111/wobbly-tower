import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
// import CannonDebugger from 'cannon-es-debugger'; // Optional: for debugging physics
import { BlockDefinition, PhysicsObject, BlockShapeType } from '../types';
import { 
    GROUND_LEVEL, 
    BLOCK_SPAWN_HEIGHT_OFFSET, 
    INITIAL_CAMERA_LOOK_AT_VECTOR,
    GHOST_BLOCK_OPACITY,
    GHOST_BLOCK_X_MOVEMENT_STEP,
    GHOST_BLOCK_ROTATION_STEP,
    GHOST_BLOCK_FINE_ROTATION_STEP,
    CAMERA_MIN_ZOOM_DISTANCE,
    CAMERA_MAX_ZOOM_DISTANCE,
    CAMERA_ZOOM_SPEED,
    CAMERA_MIN_POLAR_ANGLE,
    CAMERA_MAX_POLAR_ANGLE,
    CAMERA_ROTATION_SPEED_X,
    CAMERA_ROTATION_SPEED_Y,
    INITIAL_CAMERA_POSITION_VECTOR,
    CAMERA_PAN_SPEED,
    GAME_OVER_FALL_THRESHOLD_Y,
    FALLEN_BLOCK_DOT_THRESHOLD,
    STABILITY_INDICATOR_COLOR_GREEN,
    STABILITY_INDICATOR_COLOR_YELLOW,
    STABILITY_INDICATOR_COLOR_RED,
    STABILITY_INDICATOR_OPACITY,
    STABILITY_INDICATOR_OFFSET_Y,
    PLACEMENT_STABILITY_GREEN_THRESHOLD_BOX,
    PLACEMENT_STABILITY_YELLOW_THRESHOLD_BOX,
    PLACEMENT_STABILITY_GREEN_THRESHOLD_CYLINDER,
    PLACEMENT_STABILITY_YELLOW_THRESHOLD_CYLINDER,
    TOWER_INSTABILITY_WARNING_DOT_THRESHOLD,
    TOWER_INSTABILITY_VIGNETTE_BASE_OPACITY,
    TOWER_INSTABILITY_VIGNETTE_OPACITY_PER_BLOCK,
    TOWER_INSTABILITY_VIGNETTE_MAX_OPACITY,
    TOWER_INSTABILITY_VIGNETTE_BASE_SPREAD,
    TOWER_INSTABILITY_VIGNETTE_SPREAD_PER_BLOCK,
    TOWER_INSTABILITY_VIGNETTE_MAX_SPREAD,
    TOWER_INSTABILITY_BLOCK_COUNT_FOR_MAX_EFFECT,
    CAMERA_PRESET_FRONT,
    CAMERA_PRESET_TOP,
    CAMERA_PRESET_SIDE,
} from '../constants';

interface GameSceneProps {
  blockToPlace: BlockDefinition; 
  onGameOver: (finalScore: number) => void;
  onScoreUpdate: (score: number) => void;
  isGameOver: boolean;
  onBlockSuccessfullyPlaced: () => void;
}

const createThreeGeometry = (definition: BlockDefinition): THREE.BufferGeometry => {
    const { dimensions } = definition;
    switch (definition.shape) {
        case 'Box':
            return new THREE.BoxGeometry(dimensions.x * 2, dimensions.y * 2, dimensions.z * 2); 
        case 'Cylinder':
            return new THREE.CylinderGeometry(dimensions.x, dimensions.x, dimensions.y * 2, dimensions.z); 
        default:
            console.warn("Unknown block shape for Three.js geometry:", definition.type);
            return new THREE.BoxGeometry(1, 1, 1); 
    }
};

const createCannonShape = (definition: BlockDefinition): CANNON.Shape => {
    const { dimensions } = definition;
    switch (definition.shape) {
        case 'Box':
            return new CANNON.Box(new CANNON.Vec3(dimensions.x, dimensions.y, dimensions.z)); 
        case 'Cylinder':
            return new CANNON.Cylinder(dimensions.x, dimensions.x, dimensions.y * 2, dimensions.z);
        default:
            console.warn("Unknown block shape for Cannon-es shape:", definition.type);
            return new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)); 
    }
};

const GameScene: React.FC<GameSceneProps> = ({ 
  blockToPlace, 
  onGameOver, 
  onScoreUpdate, 
  isGameOver,
  onBlockSuccessfullyPlaced 
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const worldRef = useRef<CANNON.World | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const physicsObjectsRef = useRef<PhysicsObject[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);
  
  const ghostBlockRef = useRef<THREE.Mesh | null>(null);
  const stabilityIndicatorRef = useRef<THREE.Mesh | null>(null);
  const [ghostBlockXOffset, setGhostBlockXOffset] = useState<number>(0);
  const [ghostBlockYRotation, setGhostBlockYRotation] = useState<number>(0);

  const onGameOverRef = useRef(onGameOver);
  const onScoreUpdateRef = useRef(onScoreUpdate);
  const isGameOverRef = useRef(isGameOver);
  const blockToPlaceRef = useRef(blockToPlace);
  const onBlockSuccessfullyPlacedRef = useRef(onBlockSuccessfullyPlaced);

  const maxAchievedHeightInGameRef = useRef<number>(0);
  const currentHighestBlockYRef = useRef<number>(GROUND_LEVEL);

  useEffect(() => {
    onGameOverRef.current = onGameOver;
    onScoreUpdateRef.current = onScoreUpdate;
    isGameOverRef.current = isGameOver;
    blockToPlaceRef.current = blockToPlace;
    onBlockSuccessfullyPlacedRef.current = onBlockSuccessfullyPlaced;
  }, [onGameOver, onScoreUpdate, isGameOver, blockToPlace, onBlockSuccessfullyPlaced]);

  const [isSceneReady, setIsSceneReady] = useState(false);
  const [canAddBlock, setCanAddBlock] = useState(true); 
  const [towerInstabilityVignetteStyle, setTowerInstabilityVignetteStyle] = useState<React.CSSProperties>({});
  const [showHelpPanel, setShowHelpPanel] = useState<boolean>(false); // State for help panel visibility

  const cameraStateRef = useRef({
    isDragging: false, // For mouse
    lastMouseX: 0,
    lastMouseY: 0,
    lookAt: INITIAL_CAMERA_LOOK_AT_VECTOR.clone(),
    phi: Math.acos( (INITIAL_CAMERA_POSITION_VECTOR.y - INITIAL_CAMERA_LOOK_AT_VECTOR.y) / INITIAL_CAMERA_POSITION_VECTOR.distanceTo(INITIAL_CAMERA_LOOK_AT_VECTOR) ),
    theta: Math.atan2(INITIAL_CAMERA_POSITION_VECTOR.x - INITIAL_CAMERA_LOOK_AT_VECTOR.x, INITIAL_CAMERA_POSITION_VECTOR.z - INITIAL_CAMERA_LOOK_AT_VECTOR.z),
    radius: INITIAL_CAMERA_POSITION_VECTOR.distanceTo(INITIAL_CAMERA_LOOK_AT_VECTOR),
  });

  const touchStateRef = useRef({
    isInteracting: false, // General flag for any touch interaction
    isOrbiting: false,   // One-finger orbit
    isPinching: false,  // Two-finger pinch for zoom
    isP_anning: false,   // Two-finger drag for pan (renamed to avoid conflict with window.Panning)
    lastTouchX1: 0,
    lastTouchY1: 0,
    lastTouchX2: 0,
    lastTouchY2: 0,
    initialPinchDistance: 0,
    initialPanMidX: 0,
    initialPanMidY: 0,
  });

  const ghostBlockXOffsetProxyRef = useRef<number>(ghostBlockXOffset);
  const ghostBlockYRotationProxyRef = useRef<number>(ghostBlockYRotation);
   useEffect(() => {
    ghostBlockXOffsetProxyRef.current = ghostBlockXOffset;
  }, [ghostBlockXOffset]);
  useEffect(() => {
    ghostBlockYRotationProxyRef.current = ghostBlockYRotation;
  }, [ghostBlockYRotation]);

  const calculatePlacementStability = useCallback(() => {
    if (!ghostBlockRef.current || !blockToPlaceRef.current || physicsObjectsRef.current.length === 0) {
      return STABILITY_INDICATOR_COLOR_GREEN;
    }

    const ghostDef = blockToPlaceRef.current;
    const ghostX = ghostBlockXOffsetProxyRef.current; 
    const ghostZ = 0; 

    let highestBlock: PhysicsObject | null = null;
    let maxBlockY = -Infinity;
    physicsObjectsRef.current.forEach(obj => {
        if (obj.body.position.y > maxBlockY) {
            maxBlockY = obj.body.position.y;
            highestBlock = obj;
        }
    });
    
    if (!highestBlock) return STABILITY_INDICATOR_COLOR_GREEN;

    const targetDef = highestBlock.definition;
    const targetX = highestBlock.body.position.x;
    const targetZ = highestBlock.body.position.z;

    const offsetX = Math.abs(ghostX - targetX);
    const offsetZ = Math.abs(ghostZ - targetZ);

    if (ghostDef.shape === 'Box' && targetDef.shape === 'Box') {
        const ghostHalfWidthX = ghostDef.dimensions.x;
        const ghostHalfDepthZ = ghostDef.dimensions.z;
        const targetHalfWidthX = targetDef.dimensions.x;
        const targetHalfDepthZ = targetDef.dimensions.z;
        
        const effectiveAllowedOffsetXGreen = Math.max(0, targetHalfWidthX - ghostHalfWidthX) + ghostHalfWidthX * PLACEMENT_STABILITY_GREEN_THRESHOLD_BOX;
        const effectiveAllowedOffsetZGreen = Math.max(0, targetHalfDepthZ - ghostHalfDepthZ) + ghostHalfDepthZ * PLACEMENT_STABILITY_GREEN_THRESHOLD_BOX;
        
        const effectiveAllowedOffsetXYellow = Math.max(0, targetHalfWidthX - ghostHalfWidthX) + ghostHalfWidthX * PLACEMENT_STABILITY_YELLOW_THRESHOLD_BOX;
        const effectiveAllowedOffsetZYellow = Math.max(0, targetHalfDepthZ - ghostHalfDepthZ) + ghostHalfDepthZ * PLACEMENT_STABILITY_YELLOW_THRESHOLD_BOX;

        if (offsetX <= effectiveAllowedOffsetXGreen && offsetZ <= effectiveAllowedOffsetZGreen) {
            return STABILITY_INDICATOR_COLOR_GREEN;
        } else if (offsetX <= effectiveAllowedOffsetXYellow && offsetZ <= effectiveAllowedOffsetZYellow) {
            return STABILITY_INDICATOR_COLOR_YELLOW;
        } else {
            return STABILITY_INDICATOR_COLOR_RED;
        }
    } else if (ghostDef.shape === 'Cylinder' || targetDef.shape === 'Cylinder') { 
        const ghostRadius = ghostDef.dimensions.x; 
        const targetRadius = targetDef.dimensions.x; 
        
        const radialDistance = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);

        const effectiveAllowedRadialDistanceGreen = Math.max(0, targetRadius - ghostRadius) + ghostRadius * PLACEMENT_STABILITY_GREEN_THRESHOLD_CYLINDER;
        const effectiveAllowedRadialDistanceYellow = Math.max(0, targetRadius - ghostRadius) + ghostRadius * PLACEMENT_STABILITY_YELLOW_THRESHOLD_CYLINDER;

        if (radialDistance <= effectiveAllowedRadialDistanceGreen) {
            return STABILITY_INDICATOR_COLOR_GREEN;
        } else if (radialDistance <= effectiveAllowedRadialDistanceYellow) {
            return STABILITY_INDICATOR_COLOR_YELLOW;
        } else {
            return STABILITY_INDICATOR_COLOR_RED;
        }
    }
    
    return STABILITY_INDICATOR_COLOR_YELLOW; 
  }, []);

  const animate = useCallback(() => {
    if (!worldRef.current || !sceneRef.current || !cameraRef.current || !rendererRef.current) {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      return;
    }

    worldRef.current.step(1 / 60);

    let highestBlockYForFrame = GROUND_LEVEL;
    let anyBlockFallenOffWorld = false;
    let anyBlockTippedOverGameEnd = false;
    let unstableBlockCountForWarning = 0;
    const worldUpVector = new CANNON.Vec3(0, 1, 0);

    physicsObjectsRef.current.forEach(obj => {
      obj.mesh.position.copy(obj.body.position as unknown as THREE.Vector3);
      obj.mesh.quaternion.copy(obj.body.quaternion as unknown as THREE.Quaternion);
      
      const topOfBlock = obj.body.position.y + obj.definition.dimensions.y;
      if (topOfBlock > highestBlockYForFrame) {
        highestBlockYForFrame = topOfBlock;
      }

      const blockQuaternion = obj.body.quaternion;
      const localUpVector = new CANNON.Vec3(0, 1, 0);
      const worldBlockUpVector = blockQuaternion.vmult(localUpVector);
      worldBlockUpVector.normalize();
      const dotProduct = worldBlockUpVector.dot(worldUpVector);

      if (obj.body.position.y < GAME_OVER_FALL_THRESHOLD_Y && !isGameOverRef.current) {
          anyBlockFallenOffWorld = true;
      }

      if (physicsObjectsRef.current.length >= 2 && !isGameOverRef.current && !anyBlockTippedOverGameEnd) {
        if (dotProduct < FALLEN_BLOCK_DOT_THRESHOLD) {
          anyBlockTippedOverGameEnd = true;
        }
      }
      
      if (!isGameOverRef.current && dotProduct < TOWER_INSTABILITY_WARNING_DOT_THRESHOLD) {
        unstableBlockCountForWarning++;
      }
    });
    
    currentHighestBlockYRef.current = highestBlockYForFrame;
    const currentTowerHeightForScore = physicsObjectsRef.current.length > 0 ? currentHighestBlockYRef.current - GROUND_LEVEL : 0;

    if (!isGameOverRef.current) {
        onScoreUpdateRef.current(Math.max(0, currentTowerHeightForScore)); 
        maxAchievedHeightInGameRef.current = Math.max(maxAchievedHeightInGameRef.current, currentTowerHeightForScore);
    }

    if ((anyBlockFallenOffWorld || anyBlockTippedOverGameEnd) && !isGameOverRef.current) {
        onGameOverRef.current(Math.max(0, maxAchievedHeightInGameRef.current));
    }

    if (!isGameOverRef.current) {
        const factor = Math.min(1, unstableBlockCountForWarning / TOWER_INSTABILITY_BLOCK_COUNT_FOR_MAX_EFFECT); 
        const opacity = TOWER_INSTABILITY_VIGNETTE_BASE_OPACITY + (TOWER_INSTABILITY_VIGNETTE_MAX_OPACITY - TOWER_INSTABILITY_VIGNETTE_BASE_OPACITY) * factor;
        const spread = TOWER_INSTABILITY_VIGNETTE_BASE_SPREAD + (TOWER_INSTABILITY_VIGNETTE_MAX_SPREAD - TOWER_INSTABILITY_VIGNETTE_BASE_SPREAD) * factor;
        const blur = spread * 0.75; 

        if (unstableBlockCountForWarning > 0) {
            setTowerInstabilityVignetteStyle({
                boxShadow: `inset 0 0 ${blur}px ${spread}px rgba(255, 0, 0, ${opacity})`,
                transition: 'box-shadow 0.3s ease-out',
            });
        } else {
            setTowerInstabilityVignetteStyle({
                boxShadow: `inset 0 0 0px 0px rgba(255, 0, 0, 0)`,
                transition: 'box-shadow 0.3s ease-out',
            });
        }
    } else {
         setTowerInstabilityVignetteStyle({ boxShadow: 'none' });
    }

    if (ghostBlockRef.current && stabilityIndicatorRef.current && blockToPlaceRef.current && !isGameOverRef.current && isSceneReady) {
        let yPositionForGhost = GROUND_LEVEL + blockToPlaceRef.current.dimensions.y + BLOCK_SPAWN_HEIGHT_OFFSET;
        if (physicsObjectsRef.current.length > 0) {
            yPositionForGhost = currentHighestBlockYRef.current + blockToPlaceRef.current.dimensions.y + BLOCK_SPAWN_HEIGHT_OFFSET;
        }
        
        ghostBlockRef.current.position.set(
            ghostBlockXOffsetProxyRef.current, 
            yPositionForGhost, 
            0 
        );
        ghostBlockRef.current.rotation.set(0, ghostBlockYRotationProxyRef.current, 0);
        ghostBlockRef.current.visible = true;
        
        const indicatorColor = calculatePlacementStability();
        (stabilityIndicatorRef.current.material as THREE.MeshBasicMaterial).color.set(indicatorColor);
        stabilityIndicatorRef.current.position.set(
            ghostBlockRef.current.position.x,
            yPositionForGhost - blockToPlaceRef.current.dimensions.y - STABILITY_INDICATOR_OFFSET_Y, 
            ghostBlockRef.current.position.z
        );
        stabilityIndicatorRef.current.rotation.set(-Math.PI / 2, 0, 0); 
        stabilityIndicatorRef.current.rotation.y = ghostBlockYRotationProxyRef.current; 
        stabilityIndicatorRef.current.visible = true;

    } else if (ghostBlockRef.current) {
        ghostBlockRef.current.visible = false;
        if(stabilityIndicatorRef.current) stabilityIndicatorRef.current.visible = false;
    }

    const camState = cameraStateRef.current;
    if (cameraRef.current) {
        cameraRef.current.position.x = camState.lookAt.x + camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta);
        cameraRef.current.position.y = camState.lookAt.y + camState.radius * Math.cos(camState.phi);
        cameraRef.current.position.z = camState.lookAt.z + camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta);
        cameraRef.current.lookAt(camState.lookAt);
        cameraRef.current.updateProjectionMatrix();
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationFrameIdRef.current = requestAnimationFrame(animate);
  }, [isSceneReady, calculatePlacementStability]); 

  useEffect(() => {
    if (!mountRef.current || typeof window === 'undefined') return;

    const currentMount = mountRef.current;
    sceneRef.current = new THREE.Scene();
    sceneRef.current.background = new THREE.Color(0x34495e);

    cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    const { lookAt, radius, phi, theta } = cameraStateRef.current;
    cameraRef.current.position.x = lookAt.x + radius * Math.sin(phi) * Math.sin(theta);
    cameraRef.current.position.y = lookAt.y + radius * Math.cos(phi);
    cameraRef.current.position.z = lookAt.z + radius * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.lookAt(lookAt);

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current.setPixelRatio(window.devicePixelRatio);
    rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
    rendererRef.current.shadowMap.enabled = true;
    rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;
    currentMount.appendChild(rendererRef.current.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    sceneRef.current.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(10, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    sceneRef.current.add(directionalLight);

    worldRef.current = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    const groundMaterial = new CANNON.Material("groundMaterial");
    groundMaterial.friction = 0.6;
    groundMaterial.restitution = 0.1;
    const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial, shape: new CANNON.Plane() });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    groundBody.position.set(0, GROUND_LEVEL, 0);
    worldRef.current.addBody(groundBody);

    const groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x6ab04c, roughness: 0.9, metalness: 0.1 })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = GROUND_LEVEL;
    groundMesh.receiveShadow = true;
    sceneRef.current.add(groundMesh);

    physicsObjectsRef.current = [];
    maxAchievedHeightInGameRef.current = 0; 
    currentHighestBlockYRef.current = GROUND_LEVEL;
    setTowerInstabilityVignetteStyle({}); 
    setIsSceneReady(true);

    const handleResize = () => { 
        if (cameraRef.current && rendererRef.current && currentMount) {
            cameraRef.current.aspect = currentMount.clientWidth / currentMount.clientHeight;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      setIsSceneReady(false);
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      
      physicsObjectsRef.current.forEach(obj => { 
        sceneRef.current?.remove(obj.mesh);
        obj.mesh.geometry?.dispose();
        (obj.mesh.material as THREE.Material)?.dispose();
        if (obj.body) worldRef.current?.removeBody(obj.body);
       });
      physicsObjectsRef.current = [];

      if (ghostBlockRef.current && sceneRef.current) { 
        sceneRef.current.remove(ghostBlockRef.current);
        ghostBlockRef.current.geometry?.dispose();
        (ghostBlockRef.current.material as THREE.Material)?.dispose();
        ghostBlockRef.current = null;
       }
      if (stabilityIndicatorRef.current && sceneRef.current) {
          sceneRef.current.remove(stabilityIndicatorRef.current);
          stabilityIndicatorRef.current.geometry?.dispose();
          (stabilityIndicatorRef.current.material as THREE.Material)?.dispose();
          stabilityIndicatorRef.current = null;
      }
      
      sceneRef.current?.remove(groundMesh);
      groundMesh.geometry?.dispose();
      (groundMesh.material as THREE.Material)?.dispose();
      sceneRef.current?.remove(ambientLight);
      sceneRef.current?.remove(directionalLight);
      directionalLight.dispose(); 

      rendererRef.current?.dispose();
      if (currentMount && rendererRef.current?.domElement) { 
        currentMount.removeChild(rendererRef.current.domElement);
       }
      sceneRef.current = null;
      worldRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;

      window.removeEventListener('resize', handleResize);
    };
  }, []); 

  useEffect(() => {
    if (!isSceneReady || !sceneRef.current) {
      if (ghostBlockRef.current && sceneRef.current) {
        sceneRef.current.remove(ghostBlockRef.current);
        ghostBlockRef.current.geometry?.dispose();
        (ghostBlockRef.current.material as THREE.Material)?.dispose();
        ghostBlockRef.current = null;
      }
      if (stabilityIndicatorRef.current && sceneRef.current) {
        sceneRef.current.remove(stabilityIndicatorRef.current);
        stabilityIndicatorRef.current.geometry?.dispose();
        (stabilityIndicatorRef.current.material as THREE.Material)?.dispose();
        stabilityIndicatorRef.current = null;
      }
      return;
    }
    
    const currentBlockDef = blockToPlaceRef.current;

    if (isGameOverRef.current || !currentBlockDef) {
      if (ghostBlockRef.current) ghostBlockRef.current.visible = false;
      if (stabilityIndicatorRef.current) stabilityIndicatorRef.current.visible = false;
      return;
    }

    if (!ghostBlockRef.current) {
      const geometry = createThreeGeometry(currentBlockDef);
      const material = new THREE.MeshLambertMaterial({ 
        color: currentBlockDef.color, 
        opacity: GHOST_BLOCK_OPACITY, 
        transparent: true 
      });
      ghostBlockRef.current = new THREE.Mesh(geometry, material);
      ghostBlockRef.current.castShadow = false;
      ghostBlockRef.current.receiveShadow = false;
      ghostBlockRef.current.userData.blockType = currentBlockDef.type; 
      sceneRef.current.add(ghostBlockRef.current);
    } else { 
      if (ghostBlockRef.current.userData.blockType !== currentBlockDef.type || 
          (ghostBlockRef.current.material as THREE.MeshLambertMaterial).color.getHex() !== currentBlockDef.color) {
        ghostBlockRef.current.geometry?.dispose();
        ghostBlockRef.current.geometry = createThreeGeometry(currentBlockDef);
        (ghostBlockRef.current.material as THREE.MeshLambertMaterial).color.setHex(currentBlockDef.color);
        ghostBlockRef.current.userData.blockType = currentBlockDef.type;
      }
    }
    ghostBlockRef.current.visible = true;

    let indicatorGeometry: THREE.BufferGeometry;
    if (currentBlockDef.shape === 'Cylinder') {
        indicatorGeometry = new THREE.CircleGeometry(currentBlockDef.dimensions.x, currentBlockDef.dimensions.z); 
    } else { 
        indicatorGeometry = new THREE.PlaneGeometry(currentBlockDef.dimensions.x * 2, currentBlockDef.dimensions.z * 2);
    }

    if (!stabilityIndicatorRef.current) {
      const material = new THREE.MeshBasicMaterial({
        color: STABILITY_INDICATOR_COLOR_GREEN,
        opacity: STABILITY_INDICATOR_OPACITY,
        transparent: true,
        side: THREE.DoubleSide,
      });
      stabilityIndicatorRef.current = new THREE.Mesh(indicatorGeometry, material);
      sceneRef.current.add(stabilityIndicatorRef.current);
    } else { 
        if (stabilityIndicatorRef.current.userData.blockShape !== currentBlockDef.shape) {
            stabilityIndicatorRef.current.geometry?.dispose();
            stabilityIndicatorRef.current.geometry = indicatorGeometry;
        }
    }
    stabilityIndicatorRef.current.userData.blockShape = currentBlockDef.shape;
    stabilityIndicatorRef.current.visible = true;

    setGhostBlockXOffset(0); 
    setGhostBlockYRotation(0);

  }, [isSceneReady, blockToPlace, isGameOver]); 

  useEffect(() => {
    if (isSceneReady && !isGameOverRef.current && !animationFrameIdRef.current) {
      animationFrameIdRef.current = requestAnimationFrame(animate);
    } else if ((isGameOverRef.current || !isSceneReady) && animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isSceneReady, isGameOver, animate]);

  const internalAddBlock = useCallback(() => {
    if (!worldRef.current || !sceneRef.current || !blockToPlaceRef.current || isGameOverRef.current || !canAddBlock || !ghostBlockRef.current) return;

    setCanAddBlock(false); 
    setTimeout(() => setCanAddBlock(true), 200);

    const definition = blockToPlaceRef.current;
    
    const geometry = createThreeGeometry(definition);
    const material = new THREE.MeshStandardMaterial({ 
        color: definition.color,
        roughness: 0.6,
        metalness: 0.2
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const blockMaterial = new CANNON.Material(`blockMat-${definition.name}-${Date.now()}`); 
    blockMaterial.friction = definition.friction;
    blockMaterial.restitution = definition.restitution;
    
    const groundMat = worldRef.current.bodies.find(b => b.mass === 0)?.material; 
    if (groundMat) {
        const blockGroundContactMaterial = new CANNON.ContactMaterial(groundMat, blockMaterial, {
            friction: 0.7, 
            restitution: 0.05,
        });
        worldRef.current.addContactMaterial(blockGroundContactMaterial);
    }

    physicsObjectsRef.current.forEach(existingObj => {
        if (existingObj.body.material) {
             const blockBlockContactMaterial = new CANNON.ContactMaterial(existingObj.body.material, blockMaterial, {
                friction: Math.min(definition.friction, existingObj.definition.friction) * 0.9, 
                restitution: Math.min(definition.restitution, existingObj.definition.restitution) * 0.5, 
            });
            worldRef.current.addContactMaterial(blockBlockContactMaterial);
        }
    });

    const body = new CANNON.Body({
      mass: definition.mass,
      shape: createCannonShape(definition),
      material: blockMaterial,
      position: new CANNON.Vec3(
        ghostBlockXOffsetProxyRef.current, 
        ghostBlockRef.current.position.y, 
        0 
      ),
      quaternion: new CANNON.Quaternion().setFromEuler(0, ghostBlockYRotationProxyRef.current, 0)
    });

    body.linearDamping = 0.1;
    body.angularDamping = 0.1;

    worldRef.current.addBody(body);
    sceneRef.current.add(mesh);
    
    const newId = `block-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    physicsObjectsRef.current.push({ mesh, body, id: newId, definition });

    setGhostBlockXOffset(0); 
    setGhostBlockYRotation(0);
    onBlockSuccessfullyPlacedRef.current();

  }, [canAddBlock]); 

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    let cameraKeyHandled = true;
    const camState = cameraStateRef.current;
    switch (event.key.toLowerCase()) {
        case 'w': camState.lookAt.z -= CAMERA_PAN_SPEED; break; 
        case 's': camState.lookAt.z += CAMERA_PAN_SPEED; break; 
        case 'a': camState.lookAt.x -= CAMERA_PAN_SPEED; break;
        case 'd': camState.lookAt.x += CAMERA_PAN_SPEED; break;
        default: cameraKeyHandled = false; break;
    }
    if (cameraKeyHandled) {
        event.preventDefault();
    }

    if (isGameOverRef.current || !isSceneReady || !ghostBlockRef.current || !blockToPlaceRef.current) {
      return; 
    }
    
    let blockKeyHandled = true;
    switch (event.key.toLowerCase()) {
        case 'arrowleft':
        setGhostBlockXOffset(prev => prev - GHOST_BLOCK_X_MOVEMENT_STEP);
        break;
        case 'arrowright':
        setGhostBlockXOffset(prev => prev + GHOST_BLOCK_X_MOVEMENT_STEP);
        break;
        case 'r':
        const rotationStep = event.shiftKey ? GHOST_BLOCK_FINE_ROTATION_STEP : GHOST_BLOCK_ROTATION_STEP;
        setGhostBlockYRotation(prev => (prev + rotationStep) % (2 * Math.PI) );
        break;
        case ' ': 
        case 'enter':
        internalAddBlock();
        break;
        default:
        blockKeyHandled = false;
        break;
    }

    if (blockKeyHandled) {
        event.preventDefault();
    }
  }, [isSceneReady, internalAddBlock]); 

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || touchStateRef.current.isInteracting) return; // Ignore if touch is active
    cameraStateRef.current.isDragging = true;
    cameraStateRef.current.lastMouseX = event.clientX;
    cameraStateRef.current.lastMouseY = event.clientY;
    if (mountRef.current) {
      mountRef.current.style.cursor = 'grabbing';
    }
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!cameraStateRef.current.isDragging || touchStateRef.current.isInteracting) return; // Ignore if touch is active

    const deltaX = event.clientX - cameraStateRef.current.lastMouseX;
    const deltaY = event.clientY - cameraStateRef.current.lastMouseY;

    cameraStateRef.current.theta -= deltaX * CAMERA_ROTATION_SPEED_X;
    cameraStateRef.current.phi -= deltaY * CAMERA_ROTATION_SPEED_Y;
    cameraStateRef.current.phi = Math.max(CAMERA_MIN_POLAR_ANGLE, Math.min(CAMERA_MAX_POLAR_ANGLE, cameraStateRef.current.phi));

    cameraStateRef.current.lastMouseX = event.clientX;
    cameraStateRef.current.lastMouseY = event.clientY;
  }, []);

  const handleMouseUp = useCallback(() => {
    cameraStateRef.current.isDragging = false;
    if (mountRef.current && !touchStateRef.current.isInteracting) { // Only change cursor if not in touch mode
      mountRef.current.style.cursor = 'grab';
    }
  }, []);

  const handleWheel = useCallback((event: WheelEvent) => {
    if (touchStateRef.current.isInteracting) return; // Ignore if touch is active
    cameraStateRef.current.radius += event.deltaY * CAMERA_ZOOM_SPEED;
    cameraStateRef.current.radius = Math.max(CAMERA_MIN_ZOOM_DISTANCE, Math.min(CAMERA_MAX_ZOOM_DISTANCE, cameraStateRef.current.radius));
    event.preventDefault(); 
  }, []);

  const handleTouchStart = useCallback((event: TouchEvent) => {
    if (!mountRef.current) return;
    const touches = event.touches;
    const ts = touchStateRef.current;
    const cs = cameraStateRef.current;

    ts.isInteracting = true;
    cs.isDragging = false; // Disable mouse dragging
    mountRef.current.style.cursor = 'default';

    if (touches.length === 1) {
        ts.isOrbiting = true;
        ts.isPinching = false;
        ts.isP_anning = false;
        ts.lastTouchX1 = touches[0].clientX;
        ts.lastTouchY1 = touches[0].clientY;
    } else if (touches.length === 2) {
        event.preventDefault(); // Essential for two-finger gestures
        ts.isOrbiting = false;
        // Initial state for two fingers, move will determine pinch or pan
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        ts.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
        ts.lastTouchX1 = touches[0].clientX; // Store individual points for pinch delta calc
        ts.lastTouchY1 = touches[0].clientY;
        ts.lastTouchX2 = touches[1].clientX;
        ts.lastTouchY2 = touches[1].clientY;
        
        ts.initialPanMidX = (touches[0].clientX + touches[1].clientX) / 2;
        ts.initialPanMidY = (touches[0].clientY + touches[1].clientY) / 2;
        // Default to pan, pinch can override if distance changes significantly
        ts.isP_anning = true; 
        ts.isPinching = false;
    }
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (!mountRef.current || !touchStateRef.current.isInteracting) return;
    event.preventDefault(); // Prevent scrolling during touch interactions on canvas

    const touches = event.touches;
    const ts = touchStateRef.current;
    const cs = cameraStateRef.current;

    if (touches.length === 1 && ts.isOrbiting) {
        const deltaX = touches[0].clientX - ts.lastTouchX1;
        const deltaY = touches[0].clientY - ts.lastTouchY1;

        cs.theta -= deltaX * CAMERA_ROTATION_SPEED_X * 0.75; // Adjusted sensitivity for touch
        cs.phi -= deltaY * CAMERA_ROTATION_SPEED_Y * 0.75;
        cs.phi = Math.max(CAMERA_MIN_POLAR_ANGLE, Math.min(CAMERA_MAX_POLAR_ANGLE, cs.phi));

        ts.lastTouchX1 = touches[0].clientX;
        ts.lastTouchY1 = touches[0].clientY;

    } else if (touches.length === 2) {
        const t0 = touches[0];
        const t1 = touches[1];

        // Pinch-to-Zoom
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        const currentPinchDistance = Math.sqrt(dx * dx + dy * dy);
        const pinchDelta = currentPinchDistance - ts.initialPinchDistance;

        // Two-finger Pan
        const currentPanMidX = (t0.clientX + t1.clientX) / 2;
        const currentPanMidY = (t0.clientY + t1.clientY) / 2;
        const panDeltaX = currentPanMidX - ts.initialPanMidX;
        const panDeltaY = currentPanMidY - ts.initialPanMidY; 

        const pinchThreshold = 2; // Pixels change in distance to activate pinch
        const panThreshold = 2; // Pixels change in midpoint to activate pan
        
        if (!ts.isPinching && !ts.isP_anning) { 
            if (Math.abs(pinchDelta) > Math.max(Math.abs(panDeltaX), Math.abs(panDeltaY)) && Math.abs(pinchDelta) > pinchThreshold) {
                ts.isPinching = true;
                ts.isP_anning = false;
            } else {
                ts.isP_anning = true;
                ts.isPinching = false;
            }
        }
        
        if (ts.isPinching) {
             cs.radius -= (currentPinchDistance - ts.initialPinchDistance) * CAMERA_ZOOM_SPEED * 15; // Adjusted sensitivity
             cs.radius = Math.max(CAMERA_MIN_ZOOM_DISTANCE, Math.min(CAMERA_MAX_ZOOM_DISTANCE, cs.radius));
             ts.initialPinchDistance = currentPinchDistance;
        } else if (ts.isP_anning) {
            if (!cameraRef.current) return;
            const forward = new THREE.Vector3();
            cameraRef.current.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();

            const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), forward).normalize();
            
            const panSpeedFactor = 0.005 * cs.radius; 

            const lookAtPanVector = new THREE.Vector3();
            lookAtPanVector.copy(right).multiplyScalar(-panDeltaX * panSpeedFactor);
            cs.lookAt.add(lookAtPanVector);
            
            lookAtPanVector.copy(forward).multiplyScalar(-panDeltaY * panSpeedFactor); 
            cs.lookAt.add(lookAtPanVector);

            ts.initialPanMidX = currentPanMidX;
            ts.initialPanMidY = currentPanMidY;
        }
    }
  }, []);

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    const ts = touchStateRef.current;
    if (event.touches.length === 0) {
        ts.isInteracting = false;
        ts.isOrbiting = false;
        ts.isPinching = false;
        ts.isP_anning = false;
        if (mountRef.current) {
            mountRef.current.style.cursor = 'grab'; 
        }
    } else if (event.touches.length === 1) { 
        ts.isPinching = false;
        ts.isP_anning = false;
        ts.isOrbiting = true; 
        ts.lastTouchX1 = event.touches[0].clientX;
        ts.lastTouchY1 = event.touches[0].clientY;
    }
  }, []);

  useEffect(() => {
    const currentMount = mountRef.current; 
    if (!currentMount) return;

    currentMount.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    currentMount.addEventListener('wheel', handleWheel, { passive: false });

    currentMount.addEventListener('touchstart', handleTouchStart, { passive: false });
    currentMount.addEventListener('touchmove', handleTouchMove, { passive: false });
    currentMount.addEventListener('touchend', handleTouchEnd);
    currentMount.addEventListener('touchcancel', handleTouchEnd);


    return () => {
      currentMount?.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      currentMount?.removeEventListener('wheel', handleWheel);

      currentMount?.removeEventListener('touchstart', handleTouchStart);
      currentMount?.removeEventListener('touchmove', handleTouchMove);
      currentMount?.removeEventListener('touchend', handleTouchEnd);
      currentMount?.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleKeyDown, handleMouseMove, handleMouseUp, handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd]); 

  const setCameraPreset = useCallback((preset: 'front' | 'top' | 'side') => {
    const camState = cameraStateRef.current;
    let config;

    switch (preset) {
        case 'front':
            config = CAMERA_PRESET_FRONT;
            camState.lookAt.y = currentHighestBlockYRef.current * config.lookAtYFactor;
            break;
        case 'top':
            config = CAMERA_PRESET_TOP;
            camState.lookAt.y = physicsObjectsRef.current.length > 0 ? currentHighestBlockYRef.current / 2 : config.lookAtY;
            break;
        case 'side':
            config = CAMERA_PRESET_SIDE;
            camState.lookAt.y = currentHighestBlockYRef.current * config.lookAtYFactor;
            break;
        default: return;
    }
    
    camState.phi = config.phi;
    camState.theta = config.theta;
    camState.radius = config.radius;
    camState.lookAt.x = config.lookAtX; 
    camState.lookAt.z = config.lookAtZ;

    camState.phi = Math.max(CAMERA_MIN_POLAR_ANGLE, Math.min(CAMERA_MAX_POLAR_ANGLE, camState.phi));
  }, []);

  const toggleHelpPanel = () => {
    setShowHelpPanel(prev => !prev);
  };

  return (
    <div className="w-full h-full relative isolate">
      <div 
        ref={mountRef} 
        className="w-full h-full cursor-grab outline-none focus:outline-sky-300 focus:outline-2 touch-none"
        onMouseDown={handleMouseDown}
        role="application"
        tabIndex={0} 
        aria-label="3D 게임 장면. 마우스/터치로 카메라 조작, 키보드/화면 버튼으로 블록 조작."
      />
      <div 
        className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none rounded-lg" 
        style={towerInstabilityVignetteStyle}
        aria-hidden="true"
      />

      <button
        onClick={toggleHelpPanel}
        className="absolute top-2 right-2 p-2 bg-sky-600/80 hover:bg-sky-700/80 text-white rounded-full shadow-lg z-20 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-opacity-75"
        aria-label={showHelpPanel ? "조작법 닫기" : "조작법 보기"}
        title={showHelpPanel ? "조작법 닫기" : "조작법 보기"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
      </button>

      {showHelpPanel && (
        <div className="absolute top-2 left-2 p-4 bg-black/80 backdrop-blur-sm rounded-lg text-sm text-white shadow-xl select-none z-20 max-w-xs w-auto">
          <button
            onClick={toggleHelpPanel}
            className="absolute top-1 right-1 p-1 text-gray-300 hover:text-white"
            aria-label="조작법 패널 닫기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="font-semibold mb-1">조작법 (키보드):</p>
          <ul className="list-disc list-inside ml-1 text-xs space-y-0.5">
            <li>블록 이동: ← →</li>
            <li>블록 회전: R (세밀: Shift+R)</li>
            <li>블록 놓기: 스페이스 / 엔터</li>
            <li>카메라 회전: 마우스 드래그</li>
            <li>카메라 줌: 마우스 휠</li>
            <li>카메라 이동 (중심점): W,A,S,D</li>
          </ul>
          <p className="font-semibold mb-1 mt-2">조작법 (터치):</p>
          <ul className="list-disc list-inside ml-1 text-xs space-y-0.5">
            <li>카메라 회전: 한 손가락 드래그</li>
            <li>카메라 줌: 두 손가락 핀치</li>
            <li>카메라 이동 (중심점): 두 손가락 드래그</li>
            <li>블록 이동/회전: 화면 하단 버튼 사용</li>
          </ul>
          <div className="mt-2 pt-2 border-t border-white/20">
            <p className="font-semibold mb-1 text-xs">카메라 프리셋:</p>
            <div className="flex gap-1 flex-wrap">
                <button onClick={() => { setCameraPreset('front'); setShowHelpPanel(false); }} className="text-xs bg-sky-600 hover:bg-sky-700 px-2 py-1 rounded-md transition-colors">정면</button>
                <button onClick={() => { setCameraPreset('top'); setShowHelpPanel(false); }} className="text-xs bg-sky-600 hover:bg-sky-700 px-2 py-1 rounded-md transition-colors">탑 뷰</button>
                <button onClick={() => { setCameraPreset('side'); setShowHelpPanel(false); }} className="text-xs bg-sky-600 hover:bg-sky-700 px-2 py-1 rounded-md transition-colors">측면</button>
            </div>
          </div>
          {!blockToPlaceRef.current && !isGameOverRef.current && <p className="mt-2 text-yellow-300 animate-pulse text-xs">다음 블록 준비 중...</p>}
        </div>
      )}

      {!isGameOver && isSceneReady && blockToPlace && (
        <>
          <button
              onClick={internalAddBlock}
              disabled={!canAddBlock}
              className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-8 rounded-full shadow-xl transition-all duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-300 focus:ring-opacity-50 z-10"
              aria-label="현재 블록 놓기 (Space 또는 Enter 키로도 가능)"
              title="Space 또는 Enter 키로도 블록을 놓을 수 있습니다."
          >
            블록 놓기!
          </button>

          {/* Mobile Block Controls */}
          <div className="absolute bottom-5 left-5 flex space-x-2 z-10">
            <button 
              onClick={() => setGhostBlockXOffset(prev => prev - GHOST_BLOCK_X_MOVEMENT_STEP)}
              className="p-3 bg-sky-500/80 hover:bg-sky-600/80 text-white font-bold rounded-full shadow-lg aspect-square flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
              aria-label="블록 왼쪽으로 이동"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button 
              onClick={() => setGhostBlockXOffset(prev => prev + GHOST_BLOCK_X_MOVEMENT_STEP)}
              className="p-3 bg-sky-500/80 hover:bg-sky-600/80 text-white font-bold rounded-full shadow-lg aspect-square flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
              aria-label="블록 오른쪽으로 이동"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          <div className="absolute bottom-5 right-5 flex space-x-2 z-10">
            <button 
              onClick={() => setGhostBlockYRotation(prev => (prev + GHOST_BLOCK_ROTATION_STEP) % (2 * Math.PI))}
              className="p-3 bg-teal-500/80 hover:bg-teal-600/80 text-white font-bold rounded-full shadow-lg aspect-square flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
              aria-label="블록 회전"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            <button 
              onClick={() => setGhostBlockYRotation(prev => (prev + GHOST_BLOCK_FINE_ROTATION_STEP) % (2 * Math.PI))}
              className="p-3 bg-cyan-500/80 hover:bg-cyan-600/80 text-white font-bold rounded-full shadow-lg aspect-square flex items-center justify-center text-xs transition-transform hover:scale-110 active:scale-95"
              aria-label="블록 세밀 회전"
            >
              세밀
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default GameScene;
