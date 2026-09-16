// SyllabusCameraDialog — guided in-app capture for syllabus pages.
//
// Teachers photograph notebook pages on phones (Muneeb, 16 Sep): open
// the camera INSIDE the app, show a page-shaped frame, and coach the
// shot live — too dark, tilted, shaky — so the photo Claude reads is
// worth its cents the first time. The frame is guidance only: capture
// keeps the full camera frame (a mis-mapped crop that cuts a line is
// worse than background the reader already ignores).
//
// Live checks, all client-side and free:
//   brightness  mean luma of the framed region on a tiny sample canvas
//   sharpness   mean gradient on the same sample (blur ⇒ low)
//   tilt        deviceorientation gamma (sideways lean)
// Anything unavailable (no camera, no sensor permission) degrades to
// the plain gallery picker — never a dead end.

import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Camera, Image as ImageIcon, X } from "lucide-react";

type Tone = "bad" | "warn" | "good";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Full-frame JPEG, downscaled to ≤1568px on the long edge. */
  onCaptured: (base64: string, mediaType: string) => void;
  /** "Choose from gallery instead" — parent opens its file input. */
  onPickGallery: () => void;
}

const TONE_CLS: Record<Tone, string> = {
  bad: "bg-rose-600 text-white",
  warn: "bg-amber-500 text-white",
  good: "bg-emerald-600 text-white",
};

export function SyllabusCameraDialog({ open, onClose, onCaptured, onPickGallery }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);
  const tiltRef = useRef<number | null>(null);
  const [hint, setHint] = useState<{ tone: Tone; text: string }>({
    tone: "warn", text: "Starting camera…",
  });
  const [cameraFailed, setCameraFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    // iOS asks per-gesture for motion sensors; best-effort only.
    try {
      (window.DeviceOrientationEvent as any)?.requestPermission?.().catch(() => {});
    } catch { /* sensor hints just stay off */ }
    const onOrient = (e: DeviceOrientationEvent) => { tiltRef.current = e.gamma; };
    window.addEventListener("deviceorientation", onOrient);

    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCameraFailed(true);
          setHint({ tone: "bad", text: "Camera not available — use the gallery instead." });
        }
      });

    // The coaching loop: sample the centre of the frame ~2×/second.
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;
      const canvas = (sampleRef.current ??= document.createElement("canvas"));
      const W = 96;
      const H = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * W));
      canvas.width = W; canvas.height = H;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      if (!g) return;
      g.drawImage(video, 0, 0, W, H);
      // Sample the framed region (centre ~70%).
      const x0 = Math.round(W * 0.15), y0 = Math.round(H * 0.15);
      const w = Math.round(W * 0.7), h = Math.round(H * 0.7);
      let data: Uint8ClampedArray;
      try { data = g.getImageData(x0, y0, w, h).data; } catch { return; }
      let luma = 0;
      const lumaAt = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      for (let i = 0; i < data.length; i += 4) luma += lumaAt(i);
      luma /= data.length / 4;
      // Mean horizontal+vertical gradient — blur pushes this toward 0.
      let grad = 0, n = 0;
      for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x += 2) {
          const i = (y * w + x) * 4;
          grad += Math.abs(lumaAt(i) - lumaAt(i + 4)) + Math.abs(lumaAt(i) - lumaAt(i + w * 4));
          n++;
        }
      }
      grad /= Math.max(1, n);

      const tilt = tiltRef.current;
      if (luma < 55) setHint({ tone: "bad", text: "Too dark — turn on a light or move to a window." });
      else if (luma > 235) setHint({ tone: "bad", text: "Too bright — avoid direct light and shadows on the page." });
      else if (tilt !== null && Math.abs(tilt) > 18) setHint({ tone: "warn", text: "Straighten the phone — hold it flat over the page." });
      else if (grad < 4) setHint({ tone: "warn", text: "Blurry — hold steady and fill the box with the page." });
      else setHint({ tone: "good", text: "Looks good — fit the page in the box and capture." });
    }, 600);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("deviceorientation", onOrient);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraFailed(false);
      setHint({ tone: "warn", text: "Starting camera…" });
    };
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const MAX = 1568;
    const scale = Math.min(1, MAX / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    onCaptured(dataUrl.slice(dataUrl.indexOf(",") + 1), "image/jpeg");
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Live view + page frame */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-contain"
        />
        {/* Page-shaped guide; the shadow dims everything outside it. */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-white/90"
          style={{
            width: "min(78vw, 62vh)",
            aspectRatio: "210 / 297",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          }}
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className={`max-w-[80%] rounded-full px-3 py-1.5 text-[13px] font-semibold ${TONE_CLS[hint.tone]}`}>
            {hint.text}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      {/* Controls */}
      <div className="flex items-center justify-center gap-6 bg-black px-4 py-4">
        <Button
          variant="outline"
          size="sm"
          className="border-white/30 bg-white/10 text-white hover:bg-white/20"
          onClick={() => { onClose(); onPickGallery(); }}
        >
          <ImageIcon className="mr-1 h-4 w-4" /> Gallery
        </Button>
        <button
          type="button"
          onClick={capture}
          disabled={cameraFailed}
          aria-label="Capture the page"
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 text-white hover:bg-white/30 disabled:opacity-40"
        >
          <Camera className="h-7 w-7" />
        </button>
        {/* Spacer twin keeps the shutter centred. */}
        <div className="w-[92px]" />
      </div>
    </div>
  );
}
