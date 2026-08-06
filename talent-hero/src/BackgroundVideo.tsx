import { useEffect, useRef } from 'react';

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260530_042513_df96a13b-6155-4f6e-8b93-c9dee66fba08.mp4';

const LERP_FACTOR = 0.15;

export function BackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Smooth Animation Loop: interpolate currentTime toward targetTime
    const updateVideoTime = () => {
      if (video.duration) {
        const diff = targetTimeRef.current - video.currentTime;
        // Smooth lerp factor (0.15 for immediate, silky response)
        if (Math.abs(diff) > 0.01) {
          const nextTime = video.currentTime + diff * LERP_FACTOR;
          const v = video as HTMLVideoElement & { fastSeek?: (t: number) => void };
          if (typeof v.fastSeek === 'function') {
            v.fastSeek(nextTime);
          } else {
            video.currentTime = nextTime;
          }
        }
      }
      animationFrameRef.current = requestAnimationFrame(updateVideoTime);
    };

    // Mouse Movement Listener
    const handleMouseMove = (e: MouseEvent) => {
      if (!video.duration) return;
      // Convert X position (0 to 1) directly to video timestamp:
      // 0% X -> 0s, 100% X -> video.duration (head tracks cursor left-to-right)
      const progress = e.clientX / window.innerWidth;
      targetTimeRef.current = progress * video.duration;
    };

    window.addEventListener('mousemove', handleMouseMove);
    animationFrameRef.current = requestAnimationFrame(updateVideoTime);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={VIDEO_SRC}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full object-cover object-[70%_center]"
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}