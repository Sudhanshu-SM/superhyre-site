import { useEffect, useRef } from 'react';

const VIDEO_SRC = '/assets/videos/superhyre-hero-crt.mp4';

// ———————————————————————————————————————————————————————————————————————
// Filmstrip scrubber.
//
// The source is 4K (3828×2164), so video.currentTime seeks force a ~40ms
// full-frame decode every time — scrubbing can never run smoothly directly
// off the <video> element. Instead we decode the short clip ONCE into an
// array of small offscreen frames at load time (background), then scrubbing
// is a trivial GPU blit into a fixed canvas: zero seek latency, 60fps.
// ———————————————————————————————————————————————————————————————————————
const FRAME_COUNT = 90; // ~24fps scrub on the ~4.04s clip
const FRAME_W = 640;
const OBJECT_POSITION_X = 0.7; // camera-look tracking as on the video element

export function BackgroundVideo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let frames: HTMLCanvasElement[] = [];
    let curFrame = -1;
    let targetProgress = 0;
    let rafId: number | null = null;
    let active = true;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // Draw decoded frame i into the visible canvas, cover + 70% x-center.
    const drawFrame = (i: number) => {
      const src = frames[i];
      const cw = canvas.width;
      const ch = canvas.height;
      const scale = Math.max(cw / src.width, ch / src.height);
      const dw = src.width * scale;
      const dh = src.height * scale;
      ctx.drawImage(src, (cw - dw) * OBJECT_POSITION_X, (ch - dh) / 2, dw, dh);
    };

    // Decode the whole clip into frame canvases (background, sequential seeks
    // so we never flood the media pipeline — happens once).
    const video = document.createElement('video');
    video.src = VIDEO_SRC;
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const decodeAll = async () => {
      try {
        await new Promise<void>((resolve) => {
          if (video.readyState >= 1) resolve();
          else video.addEventListener('loadedmetadata', () => resolve());
        });
        const ratio = video.videoHeight / video.videoWidth;
        const frameH = Math.round(FRAME_W * ratio);
        for (let i = 0; i < FRAME_COUNT && active; i++) {
          const t = (i / (FRAME_COUNT - 1)) * video.duration;
          if (Math.abs(video.currentTime - t) > 0.01) {
            await new Promise<void>((resolve) => {
              const done = () => {
                video.removeEventListener('seeked', done);
                resolve();
              };
              video.addEventListener('seeked', done);
              video.currentTime = t;
            });
          }
          if (!video.videoWidth) continue;
          const frame = document.createElement('canvas');
          frame.width = FRAME_W;
          frame.height = frameH;
          const fctx = frame.getContext('2d');
          if (!fctx) continue;
          fctx.drawImage(video, 0, 0, FRAME_W, frameH);
          frames.push(frame);
          // Paint as frames arrive so the background fills progressively.
          if (active && canvas.width) drawFrame(frames.length - 1);
        }
      } catch {
        /* decoding failed — canvas stays blank */
      }
    };

    const loop = () => {
      if (active && frames.length > 0) {
        const idx = Math.round(targetProgress * (frames.length - 1));
        if (idx !== curFrame) {
          curFrame = idx;
          drawFrame(idx);
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    const handleMouseMove = (e: MouseEvent) => {
      targetProgress = e.clientX / window.innerWidth;
    };

    decodeAll();
    window.addEventListener('mousemove', handleMouseMove);
    rafId = requestAnimationFrame(loop);

    return () => {
      active = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full object-cover"
      aria-hidden="true"
    />
  );
}
