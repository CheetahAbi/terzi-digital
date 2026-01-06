import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function CarViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const wheelsRef = useRef<THREE.Group[]>([]);
  const modelRef = useRef<THREE.Group | null>(null);
  const steeringAngleRef = useRef<number>(0); // Current steering angle
  const keysPressed = useRef<Set<string>>(new Set()); // Track pressed keys
  const wheelRotationRef = useRef<number>(0); // Accumulated wheel rotation
  
  // Debug controls
  const [steeringAxis, setSteeringAxis] = useState<'x' | 'y' | 'z'>('y');
  const [rotationAxis, setRotationAxis] = useState<'x' | 'y' | 'z'>('x');
  const [manualSteeringAngle, setManualSteeringAngle] = useState<number>(0);
  const [manualRotationSpeed, setManualRotationSpeed] = useState<number>(0.05);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(true);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f1a);
    scene.fog = new THREE.Fog(0x0f0f1a, 10, 50);
    sceneRef.current = scene;

    // Camera Setup
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.5,
      100
    );
    camera.position.set(5, 2, 5);
    cameraRef.current = camera;

    // Renderer Setup
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      logarithmicDepthBuffer: true,
      alpha: false
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.8;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    // Main directional light (key light from above-front)
    const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
    mainLight.position.set(8, 12, 6);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 4096;
    mainLight.shadow.mapSize.height = 4096;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -15;
    mainLight.shadow.camera.right = 15;
    mainLight.shadow.camera.top = 15;
    mainLight.shadow.camera.bottom = -15;
    mainLight.shadow.bias = -0.0001;
    scene.add(mainLight);

    // Fill light from the side
    const fillLight = new THREE.DirectionalLight(0xa0c4ff, 1.5);
    fillLight.position.set(-8, 6, -4);
    scene.add(fillLight);

    // Rim light from behind
    const rimLight = new THREE.DirectionalLight(0xffd4a3, 1.2);
    rimLight.position.set(-4, 4, -10);
    scene.add(rimLight);

    // Point lights for extra highlights
    const pointLight1 = new THREE.PointLight(0xffffff, 2, 20);
    pointLight1.position.set(5, 3, 5);
    scene.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0xffffff, 1.5, 20);
    pointLight2.position.set(-5, 3, -5);
    scene.add(pointLight2);

    // Hemisphere light for overall ambient
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444488, 1.0);
    scene.add(hemisphereLight);
    
    // Create simple environment map for reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x444488);
    const envLight = new THREE.AmbientLight(0xffffff, 1);
    envScene.add(envLight);
    const envMap = pmremGenerator.fromScene(envScene).texture;
    scene.environment = envMap;
    pmremGenerator.dispose();

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
    gridHelper.position.y = -0.99;
    scene.add(gridHelper);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 3;
    controls.maxDistance = 20;
    controls.enablePan = true;
    controlsRef.current = controls;

    // Load GLTF Model
    const loader = new GLTFLoader();
    loader.load(
      'https://raw.githubusercontent.com/CheetahAbi/terzi-digital/7e59e238f6205ed26d8144f10fefb75b00fd0998/porsche_911.glb',
      (gltf) => {
        // Clear wheels array from previous loads
        wheelsRef.current = [];
        
        const model = gltf.scene;
        model.scale.set(1.5, 1.5, 1.5);
        model.position.set(0, -1, 0);
        
        // Find and collect the original wheel groups from GLB
        model.traverse((child) => {
          if (child.name.startsWith('wheel_')) {
            wheelsRef.current.push(child as THREE.Group);
            
            // Store initial rotation for reference
            if (!child.userData.initialRotation) {
              child.userData.initialRotation = child.rotation.clone();
            }
          }
          
          // Apply shadow and material settings to all meshes
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Fix material properties for all meshes
            if (child.material) {
              if (!child.material.userData.processed) {
                child.material = child.material.clone();
                const material = child.material as THREE.MeshStandardMaterial;
                
                material.flatShading = false;
                material.side = THREE.FrontSide;
                material.depthWrite = true;
                material.depthTest = true;
                
                if (material.map) {
                  material.map.colorSpace = THREE.SRGBColorSpace;
                  material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                  material.map.minFilter = THREE.LinearMipmapLinearFilter;
                  material.map.magFilter = THREE.LinearFilter;
                }
                if (material.emissiveMap) {
                  material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                }
                if (material.normalMap) {
                  material.normalMap.colorSpace = THREE.LinearSRGBColorSpace;
                  material.normalScale.set(1, 1);
                }
                if (material.roughnessMap) {
                  material.roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;
                }
                if (material.metalnessMap) {
                  material.metalnessMap.colorSpace = THREE.LinearSRGBColorSpace;
                }
                
                material.metalness = material.metalness ?? 0.3;
                material.roughness = material.roughness ?? 0.4;
                material.envMapIntensity = 0.8;
                material.needsUpdate = true;
                material.userData.processed = true;
              }
            }
          }
        });
        
        scene.add(model);
        modelRef.current = model;
      },
      undefined,
      (error) => {
        console.error('Error loading model:', error);
      }
    );

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      // Update steering angle based on keys pressed
      const maxSteeringAngle = Math.PI / 4; // 45 degrees max
      const steeringSpeed = 0.05;
      
      if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('a')) {
        steeringAngleRef.current = Math.min(steeringAngleRef.current + steeringSpeed, maxSteeringAngle);
      } else if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('d')) {
        steeringAngleRef.current = Math.max(steeringAngleRef.current - steeringSpeed, -maxSteeringAngle);
      } else {
        // Return to center when no keys pressed
        if (Math.abs(steeringAngleRef.current) > 0.01) {
          steeringAngleRef.current *= 0.9; // Smooth return to center
        } else {
          steeringAngleRef.current = 0;
        }
      }
      
      // Accumulate wheel rotation
      wheelRotationRef.current += manualRotationSpeed;
      
      // Rotate wheels
      wheelsRef.current.forEach((wheel) => {
        const initialRotation = wheel.userData.initialRotation as THREE.Euler;
        const isFrontWheel = wheel.name === 'wheel_front_left' || wheel.name === 'wheel_front_right';
        const isRightWheel = wheel.name === 'wheel_front_right' || wheel.name === 'wheel_rear_right';
        
        // Start with initial rotation as quaternion
        const q = new THREE.Quaternion();
        q.setFromEuler(initialRotation);
        
        // Apply steering FIRST (for front wheels only)
        if (isFrontWheel) {
          let finalSteeringAngle = steeringAngleRef.current + manualSteeringAngle;
          
          // Invert steering angle for right wheel (it's mirrored)
          if (isRightWheel) {
            finalSteeringAngle = -finalSteeringAngle;
          }
          
          const steeringQ = new THREE.Quaternion();
          
          // Create steering axis vector
          const steeringAxisVec = new THREE.Vector3(
            steeringAxis === 'x' ? 1 : 0,
            steeringAxis === 'y' ? 1 : 0,
            steeringAxis === 'z' ? 1 : 0
          );
          
          steeringQ.setFromAxisAngle(steeringAxisVec, finalSteeringAngle);
          q.multiply(steeringQ);
        }
        
        // Apply rolling rotation SECOND (around local axis)
        const rotationQ = new THREE.Quaternion();
        const rotationAxisVec = new THREE.Vector3(
          rotationAxis === 'x' ? 1 : 0,
          rotationAxis === 'y' ? 1 : 0,
          rotationAxis === 'z' ? 1 : 0
        );
        
        rotationQ.setFromAxisAngle(rotationAxisVec, wheelRotationRef.current);
        q.multiply(rotationQ);
        
        // Apply the final quaternion rotation
        wheel.quaternion.copy(q);
      });
      
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle Resize
    const handleResize = () => {
      if (!containerRef.current) return;
      
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    
    // Keyboard controls for steering
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a' || key === 'arrowright' || key === 'd') {
        keysPressed.current.add(key);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed.current.delete(key);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animationFrameId);
      
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      
      rendererRef.current?.dispose();
      controlsRef.current?.dispose();
      
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (object.material instanceof THREE.Material) {
            object.material.dispose();
          }
        }
      });
    };
  }, [steeringAxis, rotationAxis, manualSteeringAngle, manualRotationSpeed]);

  return (
    <div className="w-full h-full relative bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-6 pointer-events-none">
        <h1 className="text-white text-3xl">Porsche 911 3D Viewer</h1>
        <p className="text-slate-300 mt-2">
          Verwenden Sie die Maus zum Drehen, Zoomen und Verschieben
        </p>
      </div>

      {/* 3D Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Steuerungshinweise */}
      <div className="absolute bottom-6 left-6 bg-black/50 backdrop-blur-sm text-white p-4 rounded-lg pointer-events-none">
        <h3 className="font-semibold mb-2">Steuerung:</h3>
        <ul className="text-sm space-y-1">
          <li>🖱️ Linke Maustaste: Drehen</li>
          <li>🖱️ Rechte Maustaste: Verschieben</li>
          <li>🔍 Mausrad: Zoomen</li>
          <li>⬅️ A / Pfeil Links: Lenken links</li>
          <li>➡️ D / Pfeil Rechts: Lenken rechts</li>
        </ul>
      </div>

      {/* Debug Panel */}
      {showDebugPanel && (
        <div className="absolute top-20 right-6 bg-black/70 backdrop-blur-sm text-white p-6 rounded-lg pointer-events-auto w-80 max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg">🔧 Debug Controls</h3>
            <button 
              onClick={() => setShowDebugPanel(false)}
              className="text-white/70 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Steering Axis */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Lenkachse (Front Wheels)</label>
            <div className="flex gap-2">
              {(['x', 'y', 'z'] as const).map(axis => (
                <button
                  key={axis}
                  onClick={() => setSteeringAxis(axis)}
                  className={`flex-1 py-2 px-4 rounded ${
                    steeringAxis === axis 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Rotation Axis */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Drehachse (All Wheels)</label>
            <div className="flex gap-2">
              {(['x', 'y', 'z'] as const).map(axis => (
                <button
                  key={axis}
                  onClick={() => setRotationAxis(axis)}
                  className={`flex-1 py-2 px-4 rounded ${
                    rotationAxis === axis 
                      ? 'bg-green-600 text-white' 
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Manual Steering Angle */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Manueller Lenkwinkel: {manualSteeringAngle.toFixed(2)} rad ({(manualSteeringAngle * 180 / Math.PI).toFixed(0)}°)
            </label>
            <input
              type="range"
              min="-1.57"
              max="1.57"
              step="0.01"
              value={manualSteeringAngle}
              onChange={(e) => setManualSteeringAngle(parseFloat(e.target.value))}
              className="w-full"
            />
            <button
              onClick={() => setManualSteeringAngle(0)}
              className="mt-2 w-full py-1 px-3 bg-white/10 hover:bg-white/20 rounded text-sm"
            >
              Reset
            </button>
          </div>

          {/* Rotation Speed */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Drehgeschwindigkeit: {manualRotationSpeed.toFixed(3)}
            </label>
            <input
              type="range"
              min="0"
              max="0.2"
              step="0.001"
              value={manualRotationSpeed}
              onChange={(e) => setManualRotationSpeed(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Info */}
          <div className="text-xs text-white/60 border-t border-white/20 pt-4">
            <p className="mb-1">💡 Tipp: Drehen Sie die Kamera, um die Räder aus verschiedenen Winkeln zu sehen.</p>
            <p>🎯 Verwenden Sie A/D oder Pfeiltasten zum Testen der Lenkung.</p>
          </div>
        </div>
      )}

      {/* Toggle Debug Button */}
      {!showDebugPanel && (
        <button
          onClick={() => setShowDebugPanel(true)}
          className="absolute top-20 right-6 bg-black/70 backdrop-blur-sm text-white p-3 rounded-lg pointer-events-auto hover:bg-black/80"
        >
          🔧 Debug
        </button>
      )}
    </div>
  );
}