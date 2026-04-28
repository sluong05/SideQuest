import { useEffect, useRef } from 'react';

export default function ParticleBackground({
  showPushupModel = false,
  showIdleModel = false,
}) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mountEl = mountRef.current;
    let animId;
    let renderer;
    let cancelled = false;

    async function init() {
      const THREE = await import('three');
      if (cancelled) return;

      // ── Scene ──────────────────────────────────────────────────────────────
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0f1929, 0.0015);

      // ── Camera ─────────────────────────────────────────────────────────────
      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      camera.position.set(0, 0, 30);

      // ── Renderer ───────────────────────────────────────────────────────────
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      mountEl.appendChild(renderer.domElement);

      // ── Lighting ───────────────────────────────────────────────────────────
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambient);

      const dirLight = new THREE.DirectionalLight(0xf59e0b, 2);
      dirLight.position.set(5, 3, 5);
      scene.add(dirLight);

      // ── Stars ──────────────────────────────────────────────────────────────
      const starVerts = [];
      for (let i = 0; i < 1200; i++) {
        starVerts.push(
          THREE.MathUtils.randFloatSpread(500),
          THREE.MathUtils.randFloatSpread(500),
          THREE.MathUtils.randFloatSpread(500)
        );
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(starVerts, 3)
      );
      const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, sizeAttenuation: true });
      scene.add(new THREE.Points(starGeo, starMat));

      // ── Icosahedron ────────────────────────────────────────────────────────
      const ico = new THREE.Mesh(
        new THREE.IcosahedronGeometry(5, 0),
        new THREE.MeshStandardMaterial({ color: 0xf97316, wireframe: true })
      );
      ico.position.set(-38, -12, -15);
      scene.add(ico);

      // ── Octahedron ─────────────────────────────────────────────────────────
      const oct = new THREE.Mesh(
        new THREE.OctahedronGeometry(4, 0),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, wireframe: true })
      );
      oct.position.set(38, 12, -20);
      scene.add(oct);

      // ── Extra shapes ───────────────────────────────────────────────────────
      const shapes = [
        // [geometry, color, x, y, z]
        [new THREE.TetrahedronGeometry(3, 0),    0xf59e0b, 0,  14, -10],
        [new THREE.DodecahedronGeometry(4.5, 0), 0xf97316,  30, -14,  -8],
        [new THREE.IcosahedronGeometry(7, 0),    0xfbbf24, -50,   6, -30],
        [new THREE.OctahedronGeometry(2.5, 0),   0xf59e0b, 0,  -6,  -5],
        [new THREE.TetrahedronGeometry(5, 0),    0xfbbf24,  42,  18, -28],
      ];

      const extraMeshes = shapes.map(([geo, color, x, y, z]) => {
        const mesh = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({ color, wireframe: true })
        );
        mesh.position.set(x, y, z);
        scene.add(mesh);
        return mesh;
      });

      // ── Shared GLB material ────────────────────────────────────────────────
      const modelMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        wireframe: true,
      });

      // ── Auto-animating pushup model (welcome page) ────────────────────────
      let welcomeMixer = null;

      if (showPushupModel) {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        if (cancelled) return;

        new GLTFLoader().load('/pushupModel.glb', (gltf) => {
          if (cancelled) return;

          const model = gltf.scene;
          model.traverse((child) => {
            if (child.isMesh) {
              child.material = modelMat;
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });

          model.position.set(2.3, -8, 0);
          model.scale.setScalar(18);
          model.rotation.y = Math.PI / 2;
          scene.add(model);

          if (gltf.animations.length > 0) {
            welcomeMixer = new THREE.AnimationMixer(model);
            const action = welcomeMixer.clipAction(gltf.animations[0]);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.timeScale = 0.2; // slow pushups
            action.play();
          }
        });
      }

      // ── Auto-animating idle model (dashboard bottom-left) ──────────────────
      let idleMixer = null;
      const clock = new THREE.Clock();

      if (showIdleModel) {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        if (cancelled) return;

        new GLTFLoader().load('/pushupModel.glb', (gltf) => {
          if (cancelled) return;

          const model = gltf.scene;
          model.traverse((child) => {
            if (child.isMesh) {
              child.material = modelMat;
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });

          // Bottom-left corner of the viewport
          model.position.set(-14, -20, 0);
          model.scale.setScalar(10);
          model.rotation.y = Math.PI / 2;
          scene.add(model);

          if (gltf.animations.length > 0) {
            idleMixer = new THREE.AnimationMixer(model);
            const action = idleMixer.clipAction(gltf.animations[0]);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
          }
        });
      }

      // ── Resize ─────────────────────────────────────────────────────────────
      function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
      window.addEventListener('resize', onResize);

      // ── Scroll ─────────────────────────────────────────────────────────────
      function onScroll() {
        const top = document.body.getBoundingClientRect().top;
        ico.rotation.z   += 0.02;
        ico.rotation.y   += 0.02;
        oct.rotation.y   += 0.06;
        oct.rotation.z   += 0.06;
        extraMeshes.forEach((m, i) => {
          m.rotation.y += 0.02 + i * 0.01;
          m.rotation.z += 0.01 + i * 0.005;
        });
        camera.position.z = 30 + top * -0.01;
      }
      document.addEventListener('scroll', onScroll);

      // ── Animation loop ─────────────────────────────────────────────────────
      function animate() {
        if (cancelled) return;
        animId = requestAnimationFrame(animate);

        ico.rotation.z += 0.005;
        ico.rotation.y += 0.005;
        ico.rotation.x += 0.001;

        oct.rotation.y += 0.002;
        oct.rotation.z += 0.004;

        extraMeshes[0].rotation.y += 0.004;
        extraMeshes[0].rotation.x += 0.003;
        extraMeshes[1].rotation.z += 0.003;
        extraMeshes[1].rotation.y += 0.002;
        extraMeshes[2].rotation.x += 0.001;
        extraMeshes[2].rotation.z += 0.002;
        extraMeshes[3].rotation.y += 0.006;
        extraMeshes[3].rotation.x += 0.004;
        extraMeshes[4].rotation.z += 0.002;
        extraMeshes[4].rotation.y += 0.003;

        const delta = clock.getDelta();
        if (welcomeMixer) welcomeMixer.update(delta);
        if (idleMixer) idleMixer.update(delta);

        renderer.render(scene, camera);
      }
      animate();

      mountEl._threeCleanup = () => {
        window.removeEventListener('resize', onResize);
        document.removeEventListener('scroll', onScroll);
        starGeo.dispose();
        starMat.dispose();
        modelMat.dispose();
        renderer.dispose();
      };
    }

    init();

    return () => {
      cancelled = true;
      if (animId) cancelAnimationFrame(animId);
      if (mountEl._threeCleanup) mountEl._threeCleanup();
      if (renderer?.domElement?.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, [showPushupModel, showIdleModel]);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
