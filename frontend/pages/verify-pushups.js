import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { logPayoff, getDebt, getStreak } from '../lib/api';
import { Icon } from '../components/Icons';

// ─── MediaPipe landmark indices ───────────────────────────────────────────────
const IDX = {
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13,    R_ELBOW: 14,
  L_WRIST: 15,    R_WRIST: 16,
  L_HIP: 23,      R_HIP: 24,
  L_KNEE: 25,     R_KNEE: 26,
  L_ANKLE: 27,    R_ANKLE: 28,
};

const BODY_CONNECTIONS = [
  [IDX.L_SHOULDER, IDX.R_SHOULDER],
  [IDX.L_HIP,      IDX.R_HIP],
  [IDX.L_SHOULDER, IDX.L_HIP],
  [IDX.R_SHOULDER, IDX.R_HIP],
  [IDX.L_HIP,      IDX.L_KNEE],
  [IDX.L_KNEE,     IDX.L_ANKLE],
  [IDX.R_HIP,      IDX.R_KNEE],
  [IDX.R_KNEE,     IDX.R_ANKLE],
];

const ARM_CONNECTIONS = [
  [IDX.L_SHOULDER, IDX.L_ELBOW],
  [IDX.L_ELBOW,    IDX.L_WRIST],
  [IDX.R_SHOULDER, IDX.R_ELBOW],
  [IDX.R_ELBOW,    IDX.R_WRIST],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcAngle(a, b, c) {
  const rad =
    Math.atan2(c.y - b.y, c.x - b.x) -
    Math.atan2(a.y - b.y, a.x - b.x);
  let deg = Math.abs(rad * (180 / Math.PI));
  if (deg > 180) deg = 360 - deg;
  return deg;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.crossOrigin = 'anonymous';
    el.onload = resolve;
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

// Draw a filled, slightly-rounded rect without relying on roundRect()
function fillPill(ctx, x, y, w, h, r = 4) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function VerifyPushups() {
  const { user, loading: authLoading, updateUser } = useAuth();
  const router = useRouter();

  // DOM refs
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);

  // Session refs (used inside rAF loop — don't trigger re-renders)
  const poseRef    = useRef(null);
  const animRef    = useRef(null);
  const streamRef  = useRef(null);
  const stageRef    = useRef('up');    // 'up' | 'down'
  const repsRef     = useRef(0);
  const countingRef = useRef(false);  // whether rep counting is active
  const dingRef     = useRef(null);
  const downSinceRef = useRef(null);  // timestamp when elbow first dropped below 90°

  function playDing() {
    if (typeof window === 'undefined') return;
    if (!dingRef.current) {
      dingRef.current = new Audio('/DingSound.mp3');
    }
    dingRef.current.currentTime = 0;
    dingRef.current.play().catch(() => {});
  }

  // Gesture refs
  const gestureStartRef    = useRef(null);   // timestamp when raise-hand gesture started
  const gestureCooldownRef = useRef(false);  // prevents re-triggering immediately after toggle

  // UI state
  const [reps,            setReps]            = useState(0);
  const [angle,           setAngle]           = useState(null);
  const [backAngle,       setBackAngle]       = useState(null);
  const [stage,           setStage]           = useState('up');
  const [counting,        setCounting]        = useState(false);
  const [downHoldProgress, setDownHoldProgress] = useState(0); // 0–1 while waiting to lock 'down'
  const [mpLoading,  setMpLoading]  = useState(true);
  const [camError,   setCamError]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [totalOwed,    setTotalOwed]    = useState(0);
  const [coinsEarned,  setCoinsEarned]  = useState(0);
  const [streak,     setStreak]     = useState(0);
  const [showTipsModal, setShowTipsModal] = useState(true);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  // ── Load debt info ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    Promise.all([getDebt(), getStreak()])
      .then(([d, s]) => {
        setTotalOwed(d.data.totalOwed);
        setStreak(s.data.streak);
      })
      .catch(console.error);
  }, [user]);

  // ── Pose result handler ──────────────────────────────────────────────────────
  const onResults = useCallback((results) => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    const W = video.videoWidth  || 640;
    const H = video.videoHeight || 480;

    // Sync canvas buffer dimensions to actual video size
    if (canvas.width !== W)  canvas.width  = W;
    if (canvas.height !== H) canvas.height = H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    if (!results.poseLandmarks) return;

    const L = results.poseLandmarks;

    // Mirror x so the canvas overlay lines up with the CSS-flipped video
    const fx = (x) => W - x * W;
    const fy = (y) => y * H;

    // Helper: draw a connection between two landmarks
    const drawLine = (i, j, color, width) => {
      const a = L[i], b = L[j];
      if (!a || !b || a.visibility < 0.3 || b.visibility < 0.3) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = width;
      ctx.lineCap     = 'round';
      ctx.moveTo(fx(a.x), fy(a.y));
      ctx.lineTo(fx(b.x), fy(b.y));
      ctx.stroke();
    };

    // Body skeleton (subtle white)
    BODY_CONNECTIONS.forEach(([i, j]) =>
      drawLine(i, j, 'rgba(255,255,255,0.3)', 2)
    );

    // Arm skeleton (orange highlight)
    ARM_CONNECTIONS.forEach(([i, j]) =>
      drawLine(i, j, 'rgba(249,115,22,0.85)', 4)
    );

    // Landmark dots
    L.forEach((lm, i) => {
      if (lm.visibility < 0.3) return;
      const x = fx(lm.x);
      const y = fy(lm.y);

      const isElbow = i === IDX.L_ELBOW || i === IDX.R_ELBOW;
      const isArm   = [IDX.L_SHOULDER, IDX.R_SHOULDER,
                        IDX.L_ELBOW,   IDX.R_ELBOW,
                        IDX.L_WRIST,   IDX.R_WRIST].includes(i);

      ctx.beginPath();
      ctx.arc(x, y, isElbow ? 9 : isArm ? 6 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = isElbow
        ? '#f97316'
        : isArm
        ? '#fbbf24'
        : 'rgba(255,255,255,0.7)';
      ctx.fill();

      if (isElbow) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
    });

    // ── Elbow angle ─────────────────────────────────────────────────────────
    const lVis =
      (L[IDX.L_SHOULDER]?.visibility || 0) +
      (L[IDX.L_ELBOW]?.visibility    || 0) +
      (L[IDX.L_WRIST]?.visibility    || 0);
    const rVis =
      (L[IDX.R_SHOULDER]?.visibility || 0) +
      (L[IDX.R_ELBOW]?.visibility    || 0) +
      (L[IDX.R_WRIST]?.visibility    || 0);

    if (lVis < 1.0 && rVis < 1.0) return; // neither side visible enough

    const useLeft = lVis >= rVis;
    const sh  = useLeft ? L[IDX.L_SHOULDER] : L[IDX.R_SHOULDER];
    const el  = useLeft ? L[IDX.L_ELBOW]    : L[IDX.R_ELBOW];
    const wr  = useLeft ? L[IDX.L_WRIST]    : L[IDX.R_WRIST];

    if (!sh || !el || !wr) return;

    const deg = calcAngle(sh, el, wr);
    const ex  = fx(el.x);
    const ey  = fy(el.y);

    // Angle label background pill
    const label = `${Math.round(deg)}°`;
    ctx.font = 'bold 15px Inter, system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const px = 8, ph = 22;
    const bx = ex - tw / 2 - px;
    const by = ey - 40;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    fillPill(ctx, bx, by, tw + px * 2, ph, 5);

    ctx.fillStyle =
      deg < 90  ? '#f97316'
      : deg > 155 ? '#4ade80'
      : '#e4e4e7';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, ex, by + ph / 2);
    ctx.textBaseline = 'alphabetic';

    // Update React display state (batched by React 18)
    setAngle(Math.round(deg));

    // ── Back / torso angle — shoulder→hip line vs horizontal ─────────────────
    const lBackVis = (L[IDX.L_SHOULDER]?.visibility || 0) + (L[IDX.L_HIP]?.visibility || 0);
    const rBackVis = (L[IDX.R_SHOULDER]?.visibility || 0) + (L[IDX.R_HIP]?.visibility || 0);
    const useLeftBack = lBackVis >= rBackVis;
    const bSh  = useLeftBack ? L[IDX.L_SHOULDER] : L[IDX.R_SHOULDER];
    const bHip = useLeftBack ? L[IDX.L_HIP]      : L[IDX.R_HIP];

    let backDeg       = null;
    let backParallel  = false; // must be confirmed visible to allow counting
    if (bSh && bHip && (bSh.visibility || 0) > 0.3 && (bHip.visibility || 0) > 0.3) {
      const dx = Math.abs(bSh.x - bHip.x);
      const dy = Math.abs(bSh.y - bHip.y);
      backDeg      = Math.atan2(dy, dx) * (180 / Math.PI);
      backParallel = backDeg < 40;
      setBackAngle(Math.round(backDeg));

      // Draw a highlighted spine line over the subtle body skeleton
      const spineColor = backParallel ? 'rgba(74,222,128,0.85)' : 'rgba(248,113,113,0.85)';
      drawLine(
        useLeftBack ? IDX.L_SHOULDER : IDX.R_SHOULDER,
        useLeftBack ? IDX.L_HIP      : IDX.R_HIP,
        spineColor, 4
      );
    } else {
      setBackAngle(null);
    }

    // ── State machine — only runs when user has pressed Start ────────────────
    const DOWN_HOLD_MS = 500;

    if (countingRef.current) {
      if (deg < 90 && backParallel && stageRef.current === 'up') {
        // Start or continue timing the hold in the down position
        if (downSinceRef.current === null) downSinceRef.current = Date.now();
        const held = Date.now() - downSinceRef.current;
        setDownHoldProgress(Math.min(1, held / DOWN_HOLD_MS));
        if (held >= DOWN_HOLD_MS) {
          stageRef.current = 'down';
          setStage('down');
          setDownHoldProgress(0);
        }
      } else if (stageRef.current === 'up' && downSinceRef.current !== null) {
        // Came back up before holding long enough — reset timer
        downSinceRef.current = null;
        setDownHoldProgress(0);
      }

      if (deg > 155 && stageRef.current === 'down' && backParallel) {
        stageRef.current    = 'up';
        downSinceRef.current = null;
        setDownHoldProgress(0);
        repsRef.current += 1;
        setReps(repsRef.current);
        setStage('up');
        playDing();
      }
    }

    // ── Raise-hand gesture: wrist held above shoulder for 1.5 s ─────────────
    const GESTURE_HOLD_MS  = 1500;
    const GESTURE_THRESHOLD = 0.15; // wrist must be this far above shoulder (normalised)

    const lW  = L[IDX.L_WRIST];    const rW  = L[IDX.R_WRIST];
    const lSh = L[IDX.L_SHOULDER]; const rSh = L[IDX.R_SHOULDER];

    const lRaised = lW && lSh && lW.visibility > 0.5 && lSh.visibility > 0.5
      && (lSh.y - lW.y) > GESTURE_THRESHOLD;
    const rRaised = rW && rSh && rW.visibility > 0.5 && rSh.visibility > 0.5
      && (rSh.y - rW.y) > GESTURE_THRESHOLD;

    const gestureActive = lRaised || rRaised;
    const activeWristLm = lRaised ? lW : rRaised ? rW : null;

    const now = Date.now();

    if (gestureActive && activeWristLm && !gestureCooldownRef.current) {
      if (!gestureStartRef.current) gestureStartRef.current = now;

      const held     = now - gestureStartRef.current;
      const progress = Math.min(1, held / GESTURE_HOLD_MS);

      // Draw progress arc near the raised wrist
      const wx = fx(activeWristLm.x);
      const wy = fy(activeWristLm.y);
      const R  = 20;

      // Background circle
      ctx.beginPath();
      ctx.arc(wx, wy - 36, R, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = 3;
      ctx.stroke();

      // Progress arc
      ctx.beginPath();
      ctx.arc(wx, wy - 36, R, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * progress);
      ctx.strokeStyle = countingRef.current ? '#f87171' : '#4ade80';
      ctx.lineWidth   = 3;
      ctx.lineCap     = 'round';
      ctx.stroke();

      // Label inside arc
      const label = countingRef.current ? 'STOP' : 'GO';
      ctx.font         = 'bold 9px Inter, system-ui, sans-serif';
      ctx.fillStyle    = '#fff';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, wx, wy - 36);
      ctx.textBaseline = 'alphabetic';

      if (held >= GESTURE_HOLD_MS) {
        // Toggle counting
        if (countingRef.current) {
          countingRef.current = false;
          setCounting(false);
        } else {
          stageRef.current    = 'up';
          setStage('up');
          countingRef.current = true;
          setCounting(true);
        }
        gestureStartRef.current = null;
        gestureCooldownRef.current = true;
        setTimeout(() => { gestureCooldownRef.current = false; }, 2000);
      }
    } else if (!gestureActive) {
      gestureStartRef.current = null;
    }
  }, []);

  // ── MediaPipe + Camera init ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function init() {
      try {
        // Load drawing_utils first (pose.js depends on it)
        await loadScript(
          'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3/drawing_utils.js'
        );
        await loadScript(
          'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js'
        );

        if (cancelled) return;
        setMpLoading(false);

        // Instantiate Pose
        const pose = new window.Pose({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`,
        });

        pose.setOptions({
          modelComplexity:       1,
          smoothLandmarks:       true,
          enableSegmentation:    false,
          smoothSegmentation:    false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence:  0.5,
        });

        pose.onResults(onResults);
        poseRef.current = pose;

        // Open webcam
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width:      { ideal: 640 },
            height:     { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current       = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        // Frame-by-frame inference loop
        async function loop() {
          if (cancelled) return;
          try {
            if (poseRef.current && videoRef.current?.readyState >= 2) {
              await poseRef.current.send({ image: videoRef.current });
            }
          } catch (_) {
            // skip bad frames
          }
          if (!cancelled) {
            animRef.current = requestAnimationFrame(loop);
          }
        }

        animRef.current = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        setMpLoading(false);
        console.error('Pose init error:', err);
        if (
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError'
        ) {
          setCamError(
            'Camera access was denied. Please allow camera permissions and refresh.'
          );
        } else if (err.name === 'NotFoundError') {
          setCamError('No camera found on this device.');
        } else {
          setCamError(`Could not start: ${err.message}`);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (poseRef.current) {
        try { poseRef.current.close(); } catch (_) {}
      }
if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [user, onResults]);

  // ── Start / stop counting ────────────────────────────────────────────────────
  function startCounting() {
    stageRef.current    = 'up';
    downSinceRef.current = null;
    setStage('up');
    setDownHoldProgress(0);
    countingRef.current = true;
    setCounting(true);
  }

  function stopCounting() {
    countingRef.current  = false;
    downSinceRef.current = null;
    setCounting(false);
    setDownHoldProgress(0);
  }

  // ── Submit reps ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (reps === 0 || submitting) return;
    stopCounting();
    setSubmitting(true);
    try {
      const res = await logPayoff(reps);
      setTotalOwed(res.data.totalOwed);
      const earned = res.data.coinsEarned ?? 0;
      setCoinsEarned(earned);
      if (earned > 0) updateUser({ ...user, coins: (user.coins ?? 0) + earned });
      setSubmitted(true);
      // Reset counter so user can do another set
      repsRef.current  = 0;
      stageRef.current = 'up';
      setReps(0);
      setStage('up');
      setTimeout(() => { setSubmitted(false); setCoinsEarned(0); }, 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Auth loading screen ──────────────────────────────────────────────────────
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-navy-600 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout streak={streak}>

      {/* ── Camera tips modal ─────────────────────────────────────────────── */}
      {showTipsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="card bg-navy-700 max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div>
              <p className="text-xs text-navy-200 font-medium uppercase tracking-wide mb-3">
                Camera Position Reference
              </p>
              <p className="text-sm text-navy-300 mb-3">
                Place your camera to the <span className="text-blue-400 font-semibold">side</span> so you look like the photos below — your full body should be visible in profile.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="rounded-lg overflow-hidden bg-white/5 border border-navy-600 w-full">
                    <img
                      src="/upPushupPostition.png"
                      alt="Up position — arms extended"
                      className="w-full object-contain"
                    />
                  </div>
                  <span className="text-xs text-green-400 font-medium">▲ Up position</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="rounded-lg overflow-hidden bg-white/5 border border-navy-600 w-full">
                    <img
                      src="/downPushupPosition.png"
                      alt="Down position — elbows bent"
                      className="w-full object-contain"
                    />
                  </div>
                  <span className="text-xs text-blue-400 font-medium">▼ Down position</span>
                </div>
              </div>
            </div>

            <div className="border-t border-navy-600 pt-4 space-y-1.5">
              <p className="text-sm text-navy-200">
                <span className="font-medium">Tips:</span> Face the camera side-on for best elbow tracking.
                Keep your arms fully visible. Good lighting improves accuracy.
              </p>
              <p className="text-sm text-navy-300">
                <span className="text-blue-400 font-medium">Gesture shortcut:</span> Raise one hand above your shoulder and hold for 1.5 s to start or stop counting — no button needed.
              </p>
            </div>

            <button
              onClick={() => setShowTipsModal(false)}
              className="btn-primary w-full py-3 text-base font-bold"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <Link
              href="/pay"
              className="inline-flex items-center gap-1 text-sm text-navy-200 hover:text-navy-100 mb-2 transition-colors"
            >
              ← Change payoff method
            </Link>
            <h1 className="text-2xl font-bold text-navy-50">Verify Pushups</h1>
            <p className="text-navy-200 text-sm mt-0.5">
              Camera-verified reps · elbow angle tracking
            </p>
          </div>
          <div className="card py-3 px-5 text-center flex-shrink-0">
            <p className="text-xs text-navy-200 mb-0.5">Debt Remaining</p>
            <p className={`text-2xl font-bold tabular-nums ${totalOwed > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {totalOwed}
            </p>
            <p className="text-xs text-navy-300">pushups</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: Camera feed ─────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-3">

            {/* Video container */}
            <div className="card p-0 overflow-hidden bg-navy-600 relative" style={{ aspectRatio: '4/3' }}>

              {/* Loading overlay */}
              {mpLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-navy-700">
                  <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-navy-100 font-medium">Loading pose detection…</p>
                  <p className="text-navy-300 text-xs mt-1">Downloading MediaPipe model (~10 MB)</p>
                </div>
              )}

              {/* Camera error overlay */}
              {camError && !mpLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-navy-700 p-8 text-center">
                  <img src="/Camera.svg" alt="camera" className="w-14 h-14 mb-4" />
                  <p className="text-red-400 font-medium">{camError}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="btn-secondary mt-4 text-sm"
                  >
                    Refresh page
                  </button>
                </div>
              )}

              {/* Video feed — mirrored via CSS */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
                playsInline
                muted
              />

              {/* Canvas overlay — draws at native video res, displayed via CSS */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ pointerEvents: 'none' }}
              />

              {/* Start counting overlay — shown when camera is ready but not yet counting */}
              {!mpLoading && !camError && !counting && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] gap-4">
                  <Icon name="hand" className="w-12 h-12 drop-shadow-lg" color="#f8fafc" />
                  <div className="text-center">
                    <p className="text-white font-bold text-lg drop-shadow-md">
                      {reps > 0 ? 'Ready to resume' : 'Get in position'}
                    </p>
                    <p className="text-navy-100 text-sm drop-shadow-md mt-1">
                      Raise your hand above your shoulder<br />
                      and hold for <span className="text-blue-400 font-semibold">1.5 s</span> to start
                    </p>
                  </div>
                </div>
              )}

              {/* Stage cue + rep count — centered on video while counting */}
              {!mpLoading && !camError && counting && (
                <>
                  {/* Stage cue — large, top-center */}
                  <div className="absolute top-5 inset-x-0 flex justify-center z-10 pointer-events-none">
                    {stage === 'down' ? (
                      <span
                        className="text-3xl font-black px-8 py-3 rounded-full bg-blue-600 text-white"
                        style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)', boxShadow: '0 4px 20px rgba(249,115,22,0.4)' }}
                      >
                        ▼ DOWN
                      </span>
                    ) : downHoldProgress > 0 ? (
                      <div
                        className="relative overflow-hidden text-3xl font-black px-8 py-3 rounded-full bg-navy-800/90 text-blue-400 border-2 border-blue-500/60"
                        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
                      >
                        <div
                          className="absolute inset-0 bg-blue-600/30 rounded-full"
                          style={{ width: `${downHoldProgress * 100}%` }}
                        />
                        <span className="relative">▼ HOLD…</span>
                      </div>
                    ) : (
                      <span
                        className="text-3xl font-black px-8 py-3 rounded-full bg-navy-800/80 text-green-400 border-2 border-green-500/40"
                        style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
                      >
                        ▲ UP
                      </span>
                    )}
                  </div>

                  {/* Rep count — centered on video */}
                  <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                    <p
                      className="text-9xl font-black tabular-nums text-blue-400 select-none"
                      style={{ textShadow: '0 0 40px rgba(0,0,0,0.95), 0 4px 24px rgba(0,0,0,0.9)' }}
                    >
                      {reps}
                    </p>
                  </div>

                  {/* Raise-hand hint */}
                  <div className="absolute bottom-3 right-3 z-10">
                    <span className="flex items-center gap-1 text-white/50 text-xs bg-black/40 px-2 py-1 rounded-full"><Icon name="hand" className="w-3 h-3" color="currentColor" /> raise hand to stop</span>
                  </div>
                </>
              )}

              {/* ── Mobile stats bar — always visible at bottom of video ── */}
              {!mpLoading && !camError && (
                <div className="absolute bottom-0 left-0 right-0 z-10 lg:hidden bg-black/60 backdrop-blur-sm px-4 py-2 flex items-center justify-between gap-3">
                  {/* Rep count */}
                  <div className="flex items-center gap-2">
                    {counting && <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse flex-shrink-0" />}
                    <span className={`text-3xl font-bold tabular-nums ${counting ? 'text-blue-400' : reps > 0 ? 'text-white' : 'text-navy-300'}`}>
                      {reps}
                    </span>
                    <span className="text-xs text-navy-300">reps</span>
                  </div>

                  {/* Back angle status */}
                  <div className="text-center">
                    {backAngle !== null ? (
                      <span className={`text-xs font-medium ${backAngle < 40 ? 'text-green-400' : 'text-red-400'}`}>
                        {backAngle < 40 ? '✓ back ok' : '✗ too upright'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">align body</span>
                    )}
                  </div>

                  {/* Submit / log button */}
                  {!counting && reps > 0 && (
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="btn-primary py-1.5 px-3 text-xs font-bold flex-shrink-0"
                    >
                      {submitting ? 'Logging…' : `Log ${reps}`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Angle threshold guide */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card bg-navy-700/60 p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-400 text-sm font-bold">▼</span>
                </div>
                <div>
                  <p className="text-xs text-navy-200 font-medium uppercase tracking-wide">Down</p>
                  <p className="text-navy-100 text-sm">
                    Angle <span className="text-blue-400 font-bold">&lt; 90°</span>
                  </p>
                </div>
              </div>
              <div className="card bg-navy-700/60 p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-green-400 text-sm font-bold">▲</span>
                </div>
                <div>
                  <p className="text-xs text-navy-200 font-medium uppercase tracking-wide">Up</p>
                  <p className="text-navy-100 text-sm">
                    Angle <span className="text-green-400 font-bold">&gt; 155°</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Reopen tips modal */}
            <button
              onClick={() => setShowTipsModal(true)}
              className="btn-secondary w-full py-2.5 text-sm"
            >
              How to position yourself
            </button>
          </div>

          {/* ── Right: Stats + submit ──────────────────────────────────────── */}
          <div className="space-y-4 lg:block">

            {/* Rep counter */}
            <div className={`card text-center py-8 transition-colors duration-200 ${counting ? 'border-blue-500/40 bg-orange-950/10' : ''}`}>
              <div className="flex items-center justify-center gap-2 mb-3">
                {counting && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                )}
                <p className="text-xs text-navy-200 uppercase tracking-wider font-medium">
                  {counting ? 'Counting…' : 'Reps This Set'}
                </p>
              </div>
              <p
                className={`text-8xl font-bold tabular-nums transition-all duration-200 ${
                  counting ? 'text-blue-400' : reps > 0 ? 'text-navy-50' : 'text-navy-300'
                }`}
              >
                {reps}
              </p>
              <p className="text-navy-300 text-sm mt-3">pushups</p>
            </div>

            {/* Back angle indicator */}
            <div className={`card py-4 px-5 flex items-center gap-4 transition-colors duration-200 ${
              backAngle === null ? '' : backAngle < 40 ? 'border-green-500/30' : 'border-red-500/30'
            }`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                backAngle === null ? 'bg-navy-700' : backAngle < 40 ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                <span className={`text-sm font-bold ${
                  backAngle === null ? 'text-navy-300' : backAngle < 40 ? 'text-green-400' : 'text-red-400'
                }`}>—</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-navy-200 uppercase tracking-wide font-medium">Back Angle</p>
                {backAngle !== null ? (
                  <p className={`text-lg font-bold tabular-nums ${backAngle < 40 ? 'text-green-400' : 'text-red-400'}`}>
                    {backAngle}°{' '}
                    <span className="text-xs font-normal">
                      {backAngle < 40 ? '✓ parallel' : '✗ too upright'}
                    </span>
                  </p>
                ) : (
                  <p className="text-navy-300 text-sm">Waiting for pose…</p>
                )}
              </div>
            </div>

            {/* Elbow angle meter */}
            <div className="card py-5">
              <p className="text-xs text-navy-200 uppercase tracking-wider mb-3 font-medium text-center">
                Elbow Angle
              </p>

              {angle !== null ? (
                <>
                  <p
                    className={`text-4xl font-bold tabular-nums text-center transition-colors duration-150 ${
                      angle < 90
                        ? 'text-blue-400'
                        : angle > 155
                        ? 'text-green-400'
                        : 'text-navy-50'
                    }`}
                  >
                    {angle}°
                  </p>

                  {/* Progress bar */}
                  <div className="mt-4 relative">
                    <div className="w-full bg-navy-800 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-100 ${
                          angle < 90
                            ? 'bg-blue-600'
                            : angle > 155
                            ? 'bg-green-500'
                            : 'bg-zinc-500'
                        }`}
                        style={{ width: `${Math.min(100, (angle / 180) * 100)}%` }}
                      />
                    </div>
                    {/* Threshold markers */}
                    <div
                      className="absolute top-0 h-2.5 w-0.5 bg-blue-600/60"
                      style={{ left: `${(90 / 180) * 100}%` }}
                    />
                    <div
                      className="absolute top-0 h-2.5 w-0.5 bg-green-500/60"
                      style={{ left: `${(155 / 180) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-navy-300">
                    <span>0°</span>
                    <span className="text-orange-500/50">90°</span>
                    <span className="text-green-500/50">155°</span>
                    <span>180°</span>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-navy-300 text-sm">Waiting for pose…</p>
                  <p className="text-navy-300 text-xs mt-1">Stand in frame</p>
                </div>
              )}
            </div>

            {/* Submit button */}
            {submitted ? (
              <div className="card bg-green-900/20 border-green-800/40 text-center py-5">
                <p className="text-green-400 font-bold text-lg">✓ Reps Logged!</p>
                <p className="text-navy-200 text-sm mt-1">
                  {totalOwed > 0
                    ? `${totalOwed} pushups remaining`
                    : 'All debt cleared!'}
                </p>
                {coinsEarned > 0 && (
                  <p className="flex items-center justify-center gap-1.5 text-yellow-400 font-semibold text-sm mt-2">
                    <img src="/Pcoin.svg" alt="coin" className="w-4 h-4" />
                    +{coinsEarned} coin{coinsEarned !== 1 ? 's' : ''} earned!
                  </p>
                )}
                <p className="text-navy-300 text-xs mt-2">Counter reset — keep going!</p>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={reps === 0 || submitting}
                className="btn-primary w-full py-4 text-base font-bold"
              >
                {submitting
                  ? 'Logging…'
                  : reps > 0
                  ? `Log ${reps} Verified Rep${reps === 1 ? '' : 's'}`
                  : 'Start counting to begin'}
              </button>
            )}

            <Link
              href="/"
              className="btn-secondary w-full text-center block py-3 text-sm"
            >
              ← Back to Dashboard
            </Link>

            {/* Debt cleared celebration */}
            {totalOwed === 0 && (
              <div className="card bg-green-900/10 border-green-800/30 text-center p-4">
                <div className="flex justify-center mb-1"><Icon name="partyPopper" className="w-6 h-6" color="#4ade80" /></div>
                <p className="text-green-400 font-semibold text-sm">Debt Free!</p>
                <p className="text-navy-300 text-xs mt-1">No debt outstanding</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
