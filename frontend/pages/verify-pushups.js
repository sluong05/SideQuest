import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { logPayoff, startPayoffSession, getDebt, getStreak } from '../lib/api';
import { Icon } from '../components/Icons';
import { useSheetBehavior, SheetCloseButton, SheetHandle } from '../components/SheetModal';

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

// Pinned MediaPipe builds (unpinned "@0.5" can silently change under us)
const POSE_VERSION = '0.5.1675469404';
const POSE_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${POSE_VERSION}`;
const DRAWING_UTILS_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isLowPowerDevice() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 1023px)').matches;
}

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

// Recovery steps when the camera permission was denied
const PERMISSION_STEPS = {
  ios: [
    'In Safari, tap the aA button in the address bar',
    'Tap Website Settings',
    'Set Camera to Allow',
    'Come back here and tap Try again',
  ],
  android: [
    'In Chrome, tap the lock (or ⓘ) icon left of the address',
    'Tap Permissions → Camera',
    'Choose Allow',
    'Come back here and tap Try again',
  ],
  desktop: [
    'Click the camera or lock icon in the address bar',
    'Allow camera access for this site',
    'Click Try again',
  ],
};
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
  const lastInferRef = useRef(0);     // performance.now() of the last pose.send
  const wakeLockRef  = useRef(null);
  const bodyVisKeyRef = useRef('');   // last checklist state, to avoid re-render spam

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

  // Server-issued workout start token (backend pace check) + shoulder baseline
  const sessionTokenRef = useRef(null);
  const upShoulderYRef  = useRef(null);      // shoulder y while fully up — down requires a real drop

  // UI state
  const [reps,            setReps]            = useState(0);
  const [angle,           setAngle]           = useState(null);
  const [backAngle,       setBackAngle]       = useState(null);
  const [stage,           setStage]           = useState('up');
  const [counting,        setCounting]        = useState(false);
  const [downHoldProgress, setDownHoldProgress] = useState(0); // 0–1 while waiting to lock 'down'
  const [mpLoading,  setMpLoading]  = useState(false);
  const [camError,   setCamError]   = useState(null);   // { kind, message } | null
  const [cameraAttempt, setCameraAttempt] = useState(0); // 0 = camera not requested yet
  const [cameraOn,   setCameraOn]   = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isTouch,    setIsTouch]    = useState(false);
  const [countdown,  setCountdown]  = useState(0);
  const [bodyVis,    setBodyVis]    = useState({ shoulders: false, hips: false, wrists: false });
  const [xpEarned,   setXpEarned]   = useState(0);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [submitError,  setSubmitError]  = useState('');
  const [totalOwed,    setTotalOwed]    = useState(0);
  const [coinsEarned,  setCoinsEarned]  = useState(0);
  const [streak,     setStreak]     = useState(0);
  const [showTipsModal, setShowTipsModal] = useState(true);

  // ── Auth guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.push('/welcome');
  }, [user, authLoading]);

  // Fetch the workout start token as soon as the page opens — the server uses
  // its timestamp to reject rep counts faster than a human pace.
  useEffect(() => {
    if (!user || sessionTokenRef.current) return;
    startPayoffSession('fitness')
      .then((r) => { sessionTokenRef.current = r.data.sessionToken; })
      .catch(() => {});
  }, [user]);

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

    if (!results.poseLandmarks) {
      if (bodyVisKeyRef.current !== '000') {
        bodyVisKeyRef.current = '000';
        setBodyVis({ shoulders: false, hips: false, wrists: false });
      }
      return;
    }

    const L = results.poseLandmarks;

    // Live "in frame" checklist from landmark visibility
    const seen = (a, b) => Math.max(L[a]?.visibility || 0, L[b]?.visibility || 0) > 0.5;
    const checks = {
      shoulders: seen(IDX.L_SHOULDER, IDX.R_SHOULDER),
      hips:      seen(IDX.L_HIP, IDX.R_HIP),
      wrists:    seen(IDX.L_WRIST, IDX.R_WRIST),
    };
    const visKey = `${+checks.shoulders}${+checks.hips}${+checks.wrists}`;
    if (visKey !== bodyVisKeyRef.current) {
      bodyVisKeyRef.current = visKey;
      setBodyVis(checks);
    }

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

    // ── Orientation — hands must be planted on the floor ────────────────────
    // In a real pushup the wrist is always BELOW the shoulder in the image
    // (y grows downward). Lying on your back and pressing the hands up puts
    // the wrist above the shoulder, so that pose can never count a rep.
    const handsOnFloor = wr.y > sh.y;

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

    // ── Shoulder must actually travel down (anti "air curl") ────────────────
    // A real pushup lowers the shoulder by a big fraction of torso length;
    // bending an elbow while the body stays put does not. Baseline is the
    // shoulder height while fully up; "down" requires a real drop from it.
    const SHOULDER_DROP_FRACTION = 0.15;
    const torsoLen = bSh && bHip ? Math.hypot(bSh.x - bHip.x, bSh.y - bHip.y) : 0;
    if (stageRef.current === 'up' && deg > 155) upShoulderYRef.current = sh.y;
    const shoulderDropped =
      upShoulderYRef.current !== null &&
      torsoLen > 0 &&
      sh.y - upShoulderYRef.current >= SHOULDER_DROP_FRACTION * torsoLen;

    // ── State machine — only runs when user has pressed Start ────────────────
    const DOWN_HOLD_MS = 250;

    if (countingRef.current) {
      if (deg < 90 && backParallel && handsOnFloor && shoulderDropped && stageRef.current === 'up') {
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

      if (deg > 155 && stageRef.current === 'down' && backParallel && handsOnFloor) {
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
      const R  = 26;

      // Background circle
      ctx.beginPath();
      ctx.arc(wx, wy - 44, R, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = 3;
      ctx.stroke();

      // Progress arc
      ctx.beginPath();
      ctx.arc(wx, wy - 44, R, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * progress);
      ctx.strokeStyle = countingRef.current ? '#f87171' : '#4ade80';
      ctx.lineWidth   = 3;
      ctx.lineCap     = 'round';
      ctx.stroke();

      // Label inside arc
      const label = countingRef.current ? 'STOP' : 'GO';
      ctx.font         = 'bold 14px Inter, system-ui, sans-serif';
      ctx.fillStyle    = '#fff';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, wx, wy - 44);
      ctx.textBaseline = 'alphabetic';

      if (held >= GESTURE_HOLD_MS) {
        // Toggle counting
        if (countingRef.current) {
          countingRef.current = false;
          setCounting(false);
        } else {
          stageRef.current    = 'up';
          upShoulderYRef.current = null;
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

  // ── Orientation / pointer tracking (landscape guidance, low-power model) ──────
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const pq = window.matchMedia('(orientation: portrait)');
    const tq = window.matchMedia('(pointer: coarse)');
    const update = () => { setIsPortrait(pq.matches); setIsTouch(tq.matches); };
    update();
    const add = (mq) => (mq.addEventListener ? mq.addEventListener('change', update) : mq.addListener(update));
    const rm = (mq) => (mq.removeEventListener ? mq.removeEventListener('change', update) : mq.removeListener(update));
    add(pq); add(tq);
    return () => { rm(pq); rm(tq); };
  }, []);

  // ── Keep the screen awake while counting (re-acquired after tab switches) ────
  useEffect(() => {
    if (!counting || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;
    let active = true;
    async function acquire() {
      try {
        if (active && document.visibilityState === 'visible') {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (_) { /* denied / unsupported — counting still works */ }
    }
    function onVisibility() { if (document.visibilityState === 'visible') acquire(); }
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
    };
  }, [counting]);

  // ── Start-counting countdown (time to get into position) ────────────────────
  useEffect(() => {
    if (countdown <= 0) return undefined;
    const id = setTimeout(() => {
      if (countdown === 1) { setCountdown(0); startCounting(); }
      else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // ── Camera + MediaPipe init — only after the user taps "Start camera" ───────
  // Key on "signed in" rather than the user object: updateUser() after a
  // submit must not tear down and restart the camera.
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn || cameraAttempt === 0) return undefined;

    let cancelled = false;

    async function init() {
      setCamError(null);
      setMpLoading(true);
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          const e = new Error('This browser can’t open the camera here. Use Safari or Chrome over a secure (https) connection.');
          e.name = 'InsecureContextError';
          throw e;
        }

        // Ask for the camera first so the permission prompt follows the tap
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

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (cancelled) return;
        setCameraOn(true);

        // drawing_utils is loaded alongside pose (same release train)
        await loadScript(DRAWING_UTILS_URL);
        await loadScript(`${POSE_BASE}/pose.js`);
        if (cancelled) return;

        const pose = new window.Pose({
          locateFile: (file) => `${POSE_BASE}/${file}`,
        });

        pose.setOptions({
          // lite model on phones/tablets — much faster, accurate enough for elbows
          modelComplexity:       isLowPowerDevice() ? 0 : 1,
          smoothLandmarks:       true,
          enableSegmentation:    false,
          smoothSegmentation:    false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence:  0.5,
        });

        pose.onResults(onResults);
        poseRef.current = pose;
        setMpLoading(false);

        // Inference loop, throttled to ~15 fps (plenty for pushups, saves battery)
        const FRAME_MS = 1000 / 15;
        async function loop() {
          if (cancelled) return;
          const now = performance.now();
          if (!document.hidden && now - lastInferRef.current >= FRAME_MS) {
            lastInferRef.current = now;
            try {
              if (poseRef.current && videoRef.current?.readyState >= 2) {
                await poseRef.current.send({ image: videoRef.current });
              }
            } catch (_) {
              // skip bad frames
            }
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
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError') {
          setCamError({ kind: 'denied', message: 'Camera access is blocked for this site.' });
        } else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
          setCamError({ kind: 'notfound', message: 'No camera found on this device.' });
        } else if (err.name === 'NotReadableError') {
          setCamError({ kind: 'busy', message: 'Your camera is being used by another app. Close it, then try again.' });
        } else {
          setCamError({ kind: 'other', message: err.message ? `Could not start: ${err.message}` : 'Could not start the camera.' });
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (poseRef.current) {
        try { poseRef.current.close(); } catch (_) {}
        poseRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraOn(false);
    };
  }, [signedIn, onResults, cameraAttempt]);

  // ── Start / stop counting ────────────────────────────────────────────────────
  function startCounting() {
    stageRef.current    = 'up';
    downSinceRef.current = null;
    upShoulderYRef.current = null;
    setStage('up');
    setDownHoldProgress(0);
    countingRef.current = true;
    setCounting(true);
  }

  function stopCounting() {
    setCountdown(0);
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
    setSubmitError('');
    try {
      if (!sessionTokenRef.current) {
        // Mount-time fetch failed (e.g. flaky network) — try once more
        sessionTokenRef.current = (await startPayoffSession('fitness')).data.sessionToken;
      }
      const res = await logPayoff(reps, 'fitness', sessionTokenRef.current);
      setTotalOwed(res.data.totalOwed);
      const earned = res.data.coinsEarned ?? 0;
      const xp = res.data.xpEarned ?? 0;
      setCoinsEarned(earned);
      setXpEarned(xp);
      if (earned > 0 || xp > 0) updateUser({ ...user, coins: (user.coins ?? 0) + earned, xp: (user.xp ?? 0) + xp });
      setSubmitted(true);
      // Fresh token for the next set (each token covers one logged session)
      sessionTokenRef.current = null;
      startPayoffSession('fitness')
        .then((r) => { sessionTokenRef.current = r.data.sessionToken; })
        .catch(() => {});
      // Reset counter so user can do another set
      repsRef.current  = 0;
      stageRef.current = 'up';
      setReps(0);
      setStage('up');
      setTimeout(() => { setSubmitted(false); setCoinsEarned(0); setXpEarned(0); }, 4000);
    } catch (err) {
      console.error(err);
      setSubmitError(err.response?.data?.error || 'Could not log reps — try again');
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
  const platform = typeof navigator === 'undefined' ? 'desktop' : detectPlatform();
  const cameraReady = cameraOn && !mpLoading && !camError;
  // Full-screen camera on phones while counting (or counting down)
  const immersive = cameraReady && (counting || countdown > 0);
  const showRotateHint = cameraReady && isTouch && isPortrait;

  function startCamera() {
    setShowTipsModal(false);
    setCameraAttempt((a) => a + 1);
  }

  return (
    <Layout streak={streak} disableBackground>

      {/* ── Camera tips (shown before the camera is ever requested) ──────── */}
      {showTipsModal && (
        <TipsSheet
          isTouch={isTouch}
          cameraStarted={cameraAttempt > 0}
          onClose={() => setShowTipsModal(false)}
          onStartCamera={startCamera}
        />
      )}

      <div className="max-w-5xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-4">
          <div className="min-w-0">
            <Link
              href="/pay"
              className="inline-flex items-center gap-1 min-h-[44px] text-sm text-navy-200 hover:text-navy-100 transition-colors"
            >
              ← Change payoff method
            </Link>
            <h1 className="text-2xl font-bold text-navy-50">Verify Pushups</h1>
            <p className="text-navy-200 text-sm mt-0.5">
              Camera-verified reps · elbow angle tracking
            </p>
          </div>
          <div className="card py-3 px-4 sm:px-5 text-center flex-shrink-0">
            <p className="text-xs text-navy-200 mb-0.5">Debt Remaining</p>
            <p className={`text-2xl font-bold tabular-nums ${totalOwed > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {totalOwed}
            </p>
            <p className="text-xs text-navy-200">pts</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: Camera feed ─────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-3">

            {/* Video container — becomes full-screen on phones while counting */}
            <div
              className={immersive
                ? 'fixed inset-0 z-[60] bg-black overflow-hidden lg:relative lg:inset-auto lg:z-auto lg:rounded-2xl lg:aspect-[4/3]'
                : 'card p-0 overflow-hidden bg-navy-600 relative aspect-[4/3]'}
            >

              {/* Not started yet */}
              {cameraAttempt === 0 && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-navy-700 p-6 text-center gap-3">
                  <img src="/Camera.svg" alt="" width={56} height={56} className="w-14 h-14" />
                  <p className="text-navy-100 font-semibold">Camera is off</p>
                  <p className="text-navy-200 text-sm max-w-xs">Your video never leaves your device — reps are counted right here in the browser.</p>
                  <button onClick={startCamera} className="btn-primary min-h-[48px] px-6 text-base font-bold mt-1">
                    <Icon name="play" className="w-4 h-4" color="currentColor" /> Start camera
                  </button>
                  <button onClick={() => setShowTipsModal(true)} className="min-h-[44px] px-3 text-sm text-blue-400 hover:text-blue-300">
                    How to position yourself
                  </button>
                </div>
              )}

              {/* Loading overlay */}
              {cameraAttempt > 0 && mpLoading && !camError && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-navy-700/90 p-6 text-center">
                  <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-navy-100 font-medium">{cameraOn ? 'Loading pose detection…' : 'Waiting for camera…'}</p>
                  <p className="text-navy-200 text-xs mt-1">{cameraOn ? 'Downloading the MediaPipe model (first time only)' : 'Allow camera access when your browser asks'}</p>
                </div>
              )}

              {/* Camera error overlay */}
              {camError && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-navy-700 p-5 sm:p-8 text-center overflow-y-auto">
                  <img src="/Camera.svg" alt="" width={48} height={48} className="w-12 h-12 mb-3" />
                  <p className="text-red-400 font-semibold">{camError.message}</p>
                  {camError.kind === 'denied' && (
                    <ol className="text-left text-sm text-navy-100 mt-3 space-y-1.5 list-decimal list-inside max-w-xs">
                      {PERMISSION_STEPS[platform].map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  )}
                  <button
                    onClick={() => setCameraAttempt((a) => a + 1)}
                    className="btn-primary mt-4 min-h-[44px] px-6 text-sm"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Video feed — mirrored via CSS; contain so the whole body stays in view */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-contain"
                style={{ transform: 'scaleX(-1)' }}
                playsInline
                muted
              />

              {/* Canvas overlay — same object-fit as the video so landmarks line up */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-contain"
                style={{ pointerEvents: 'none' }}
              />

              {/* Live visibility checklist */}
              {cameraReady && (
                <div
                  className="absolute left-2 z-20 flex flex-wrap gap-1.5 pointer-events-none"
                  style={{ top: immersive ? 'calc(env(safe-area-inset-top, 0px) + 8px)' : 8 }}
                  aria-live="polite"
                >
                  {[['shoulders', 'Shoulders'], ['hips', 'Hips'], ['wrists', 'Wrists']].map(([k, lbl]) => (
                    <span
                      key={k}
                      className="flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-full"
                      style={bodyVis[k]
                        ? { background: 'rgba(22,101,52,0.75)', color: '#bbf7d0' }
                        : { background: 'rgba(0,0,0,0.6)', color: '#fca5a5' }}
                    >
                      {bodyVis[k] ? '✓' : '✗'} {lbl}
                    </span>
                  ))}
                </div>
              )}

              {/* Portrait hint on phones */}
              {showRotateHint && !counting && countdown === 0 && (
                <div className="absolute inset-x-3 bottom-16 z-20 rounded-xl px-3 py-2.5 text-sm text-center pointer-events-none" style={{ background: 'rgba(0,0,0,0.72)', color: '#fde68a' }}>
                  Turn your phone sideways, lean it ~2m away at floor level so your whole body fits.
                </div>
              )}

              {/* Ready overlay — camera on, not counting */}
              {cameraReady && !counting && countdown === 0 && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 gap-3 p-4">
                  <Icon name="hand" className="w-10 h-10 drop-shadow-lg" color="#f8fafc" />
                  <div className="text-center">
                    <p className="text-white font-bold text-lg drop-shadow-md">
                      {reps > 0 ? 'Ready to resume' : 'Get in position'}
                    </p>
                    <p className="text-navy-100 text-sm drop-shadow-md mt-1">
                      Raise your hand above your shoulder for <span className="text-blue-300 font-semibold">1.5 s</span>, or
                    </p>
                  </div>
                  <button
                    onClick={() => setCountdown(5)}
                    className="btn-primary min-h-[48px] px-6 text-base font-bold"
                  >
                    Start counting in 5 s
                  </button>
                </div>
              )}

              {/* Countdown */}
              {cameraReady && countdown > 0 && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/30 pointer-events-none">
                  <p className="text-8xl font-black text-white tabular-nums" style={{ textShadow: '0 4px 24px rgba(0,0,0,0.9)' }}>{countdown}</p>
                  <p className="text-white/90 text-sm font-semibold mt-2">Get into the up position</p>
                </div>
              )}

              {/* Stage cue + rep count — centered on video while counting */}
              {cameraReady && counting && (
                <>
                  {/* Stage cue — large, top-center */}
                  <div
                    className="absolute inset-x-0 flex justify-center z-10 pointer-events-none"
                    style={{ top: immersive ? 'calc(env(safe-area-inset-top, 0px) + 44px)' : 20 }}
                  >
                    {stage === 'down' ? (
                      <span
                        className="text-2xl sm:text-3xl font-black px-8 py-3 rounded-full bg-blue-600 text-white"
                        style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)', boxShadow: '0 4px 20px rgba(249,115,22,0.4)' }}
                      >
                        ▼ DOWN
                      </span>
                    ) : downHoldProgress > 0 ? (
                      <div
                        className="relative overflow-hidden text-2xl sm:text-3xl font-black px-8 py-3 rounded-full bg-navy-800/90 text-blue-400 border-2 border-blue-500/60"
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
                        className="text-2xl sm:text-3xl font-black px-8 py-3 rounded-full bg-navy-800/80 text-green-400 border-2 border-green-500/40"
                        style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
                      >
                        ▲ UP
                      </span>
                    )}
                  </div>

                  {/* Rep count — centered on video */}
                  <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                    <p
                      className="text-8xl sm:text-9xl font-black tabular-nums text-blue-400 select-none"
                      style={{ textShadow: '0 0 40px rgba(0,0,0,0.95), 0 4px 24px rgba(0,0,0,0.9)' }}
                      aria-live="polite"
                    >
                      {reps}
                    </p>
                  </div>

                  {/* Raise-hand hint (desktop) */}
                  <div className="hidden lg:block absolute bottom-3 right-3 z-10">
                    <span className="flex items-center gap-1 text-white/70 text-xs bg-black/40 px-2 py-1 rounded-full"><Icon name="hand" className="w-3 h-3" color="currentColor" /> raise hand to stop</span>
                  </div>
                </>
              )}

              {/* ── Mobile control bar — bottom of video ── */}
              {cameraReady && (
                <div
                  className="absolute bottom-0 left-0 right-0 z-20 lg:hidden bg-black/65 backdrop-blur-sm px-3 pt-2 flex items-center justify-between gap-2"
                  style={{ paddingBottom: immersive ? 'max(8px, env(safe-area-inset-bottom, 0px))' : 8 }}
                >
                  {/* Rep count */}
                  <div className="flex items-center gap-2 min-w-0">
                    {counting && <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse flex-shrink-0" />}
                    <span className={`text-3xl font-bold tabular-nums ${counting ? 'text-blue-400' : reps > 0 ? 'text-white' : 'text-navy-200'}`}>
                      {reps}
                    </span>
                    <span className="text-xs text-navy-200">reps</span>
                    {backAngle !== null && (
                      <span className={`text-xs font-medium ml-1 ${backAngle < 40 ? 'text-green-400' : 'text-red-400'}`}>
                        {backAngle < 40 ? '✓ back' : '✗ upright'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(counting || countdown > 0) && (
                      <button
                        onClick={stopCounting}
                        className="btn-secondary min-h-[44px] px-4 text-sm font-bold"
                      >
                        Stop
                      </button>
                    )}
                    {!counting && countdown === 0 && reps > 0 && (
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="btn-primary min-h-[44px] px-4 text-sm font-bold"
                      >
                        {submitting ? 'Logging…' : `Log ${reps}`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {submitError && (
              <p role="alert" className="text-sm text-red-400 font-medium px-1">{submitError}</p>
            )}

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

            {/* Reopen tips */}
            <button
              onClick={() => setShowTipsModal(true)}
              className="btn-secondary w-full min-h-[44px] text-sm"
            >
              How to position yourself
            </button>
          </div>

          {/* ── Right: Stats + submit ──────────────────────────────────────── */}
          <div className="space-y-4 lg:block">

            {/* Rep counter */}
            <div className={`card text-center py-6 sm:py-8 transition-colors duration-200 ${counting ? 'border-blue-500/40 bg-orange-950/10' : ''}`}>
              <div className="flex items-center justify-center gap-2 mb-3">
                {counting && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                )}
                <p className="text-xs text-navy-200 uppercase tracking-wider font-medium">
                  {counting ? 'Counting…' : 'Reps This Set'}
                </p>
              </div>
              <p
                className={`text-7xl sm:text-8xl font-bold tabular-nums transition-all duration-200 ${
                  counting ? 'text-blue-400' : reps > 0 ? 'text-navy-50' : 'text-navy-200'
                }`}
              >
                {reps}
              </p>
              <p className="text-navy-200 text-sm mt-3">pushups</p>
            </div>

            {/* Back angle indicator */}
            <div className={`card py-4 px-5 flex items-center gap-4 transition-colors duration-200 ${
              backAngle === null ? '' : backAngle < 40 ? 'border-green-500/30' : 'border-red-500/30'
            }`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                backAngle === null ? 'bg-navy-700' : backAngle < 40 ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                <span className={`text-sm font-bold ${
                  backAngle === null ? 'text-navy-200' : backAngle < 40 ? 'text-green-400' : 'text-red-400'
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
                  <p className="text-navy-200 text-sm">Waiting for pose…</p>
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
                  <div className="flex justify-between mt-1 text-xs text-navy-200">
                    <span>0°</span>
                    <span className="text-orange-400">90°</span>
                    <span className="text-green-400">155°</span>
                    <span>180°</span>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-navy-200 text-sm">Waiting for pose…</p>
                  <p className="text-navy-200 text-xs mt-1">{cameraOn ? 'Get your whole body in frame' : 'Start the camera to begin'}</p>
                </div>
              )}
            </div>

            {/* Submit button */}
            {submitted ? (
              <div className="card bg-green-900/20 border-green-800/40 text-center py-5" role="status">
                <p className="text-green-400 font-bold text-lg">✓ Reps Logged!</p>
                <p className="text-navy-200 text-sm mt-1">
                  {totalOwed > 0
                    ? `${totalOwed} pts remaining`
                    : 'All debt cleared!'}
                </p>
                {(xpEarned > 0 || coinsEarned > 0) && (
                  <div className="flex items-center justify-center gap-3 mt-2">
                    {xpEarned > 0 && <span className="text-blue-400 font-bold text-sm">+{xpEarned} XP</span>}
                    {coinsEarned > 0 && (
                      <span className="flex items-center gap-1.5 text-yellow-400 font-semibold text-sm">
                        <img src="/coin.png" alt="" width={16} height={16} className="w-4 h-4" />
                        +{coinsEarned} coin{coinsEarned !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-navy-200 text-xs mt-2">Counter reset — keep going!</p>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={reps === 0 || submitting}
                className="btn-primary w-full min-h-[52px] text-base font-bold"
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
              className="btn-secondary w-full text-center min-h-[44px] text-sm"
            >
              ← Back to Dashboard
            </Link>

            {/* Debt cleared celebration */}
            {totalOwed === 0 && (
              <div className="card bg-green-900/10 border-green-800/30 text-center p-4">
                <div className="flex justify-center mb-1"><Icon name="partyPopper" className="w-6 h-6" color="#4ade80" /></div>
                <p className="text-green-400 font-semibold text-sm">Debt Free!</p>
                <p className="text-navy-200 text-xs mt-1">No debt outstanding</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ─── Camera tips sheet ────────────────────────────────────────────────────────
function TipsSheet({ isTouch, cameraStarted, onClose, onStartCamera }) {
  useSheetBehavior(onClose);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pushup-tips-title"
        className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: '#060C18', border: '1px solid rgba(59,130,246,0.25)' }}
      >
        <SheetHandle />
        <div className="flex items-center justify-between gap-3 px-5 pt-2 sm:pt-4 pb-2 flex-shrink-0">
          <h2 id="pushup-tips-title" className="text-base font-bold text-navy-50">Set up your camera</h2>
          <SheetCloseButton onClose={onClose} label="Close tips" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4 space-y-4">
          <p className="text-sm text-navy-200">
            Place your camera to the <span className="text-blue-400 font-semibold">side</span> so you look like the photos below — your full body should be visible in profile.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <div className="rounded-lg overflow-hidden bg-white/5 border border-navy-600 w-full">
                <img src="/upPushupPostition.png" alt="Up position — arms extended" className="w-full object-contain" />
              </div>
              <span className="text-xs text-green-400 font-medium">▲ Up position</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="rounded-lg overflow-hidden bg-white/5 border border-navy-600 w-full">
                <img src="/downPushupPosition.png" alt="Down position — elbows bent" className="w-full object-contain" />
              </div>
              <span className="text-xs text-blue-400 font-medium">▼ Down position</span>
            </div>
          </div>
          <ul className="text-sm text-navy-100 space-y-2">
            {isTouch && (
              <li className="flex gap-2"><span className="text-amber-300">•</span> Turn your phone sideways, lean it ~2m away at floor level.</li>
            )}
            <li className="flex gap-2"><span className="text-blue-400">•</span> Face the camera side-on so your elbow is clearly visible.</li>
            <li className="flex gap-2"><span className="text-blue-400">•</span> Keep shoulders, hips and wrists in frame — the checklist turns green when they are.</li>
            <li className="flex gap-2"><span className="text-blue-400">•</span> Good lighting improves accuracy. Video stays on your device.</li>
            <li className="flex gap-2"><span className="text-blue-400">•</span> <span><span className="text-blue-400 font-medium">Gesture:</span> raise one hand above your shoulder for 1.5 s to start or stop counting.</span></li>
          </ul>
        </div>
        <div className="sheet-footer px-5 pt-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(59,130,246,0.12)' }}>
          {cameraStarted ? (
            <button onClick={onClose} className="btn-primary w-full min-h-[48px] text-base font-bold">Got it</button>
          ) : (
            <button onClick={onStartCamera} className="btn-primary w-full min-h-[48px] text-base font-bold">
              <Icon name="play" className="w-4 h-4" color="currentColor" /> Start camera
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
