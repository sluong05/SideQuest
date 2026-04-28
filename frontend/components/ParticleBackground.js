import { useEffect, useRef } from 'react';

export default function ParticleBackground() {
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
      const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 });
      scene.add(new THREE.Points(starGeo, starMat));

      // ── Torus ──────────────────────────────────────────────────────────────
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(10, 3, 16, 100),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, wireframe: true })
      );
      scene.add(torus);

      // ── Icosahedron ────────────────────────────────────────────────────────
      const ico = new THREE.Mesh(
        new THREE.IcosahedronGeometry(5, 0),
        new THREE.MeshStandardMaterial({ color: 0xf97316, wireframe: true })
      );
      ico.position.set(-22, -12, -15);
      scene.add(ico);

      // ── Octahedron ─────────────────────────────────────────────────────────
      const oct = new THREE.Mesh(
        new THREE.OctahedronGeometry(4, 0),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, wireframe: true })
      );
      oct.position.set(22, 12, -20);
      scene.add(oct);

      // ── Resize ─────────────────────────────────────────────────────────────
      function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
      window.addEventListener('resize', onResize);

      // ── Scroll parallax ────────────────────────────────────────────────────
      function onScroll() {
        const t = document.body.getBoundingClientRect().top;
        torus.rotation.x += 0.04;
        torus.rotation.y += 0.06;
        ico.rotation.z   += 0.02;
        ico.rotation.y   += 0.02;
        oct.rotation.y   += 0.06;
        oct.rotation.z   += 0.06;
        camera.position.z = 30 + t * -0.05;
      }
      document.addEventListener('scroll', onScroll);

      // ── Animation loop ─────────────────────────────────────────────────────
      function animate() {
        if (cancelled) return;
        animId = requestAnimationFrame(animate);

        torus.rotation.x += 0.004;
        torus.rotation.y += 0.002;

        ico.rotation.z += 0.005;
        ico.rotation.y += 0.005;
        ico.rotation.x += 0.001;

        oct.rotation.y += 0.002;
        oct.rotation.z += 0.004;

        renderer.render(scene, camera);
      }
      animate();

      // store refs for cleanup
      mountEl._threeCleanup = () => {
        window.removeEventListener('resize', onResize);
        document.removeEventListener('scroll', onScroll);
        starGeo.dispose();
        starMat.dispose();
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
  }, []);

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
