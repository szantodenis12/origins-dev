"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, ScanLine } from "lucide-react";

/**
 * Viewfinder for the Wallet pass QR.
 *
 * Decoding runs through jsQR on a canvas: BarcodeDetector still does not exist
 * in iOS Safari, and half the counter phones are iPhones. Rear camera when the
 * device has one. If the camera is refused or missing, this says so and the
 * manual serial field below carries the whole flow.
 */

const strings = {
  hint: "Ține codul QR de pe card în cadru.",
  starting: "Pornim camera...",
  offline:
    "Camera nu pornește. Verifică permisiunea din browser sau caută cardul după serie.",
  retry: "Încearcă din nou",
};

type CameraState = "starting" | "live" | "offline";

/** Canvas is downscaled: jsQR stays accurate at this size and much faster. */
const SAMPLE = 360;

/** Grabs the central square of the current frame and decodes it. */
function decodeFrame(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
): string | null {
  if (!video || !canvas || video.readyState < video.HAVE_CURRENT_DATA) {
    return null;
  }

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  const side = Math.min(width, height);
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  context.drawImage(
    video,
    (width - side) / 2,
    (height - side) / 2,
    side,
    side,
    0,
    0,
    SAMPLE,
    SAMPLE,
  );

  const image = context.getImageData(0, 0, SAMPLE, SAMPLE);
  const code = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "dontInvert",
  });
  return code?.data ?? null;
}

export default function QrScanner({
  onDecode,
  paused,
}: {
  onDecode: (text: string) => void;
  paused: boolean;
}) {
  const [state, setState] = useState<CameraState>("starting");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const decodeRef = useRef(onDecode);
  const pausedRef = useRef(paused);

  useEffect(() => {
    decodeRef.current = onDecode;
  }, [onDecode]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const stop = useCallback(() => {
    requestRef.current += 1;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  /**
   * Asks for the camera and starts the decode loop. State only changes from
   * the promise callbacks, which is what the browser tells us happened.
   */
  const attach = useCallback(() => {
    // Invalidates a pending permission request or an older retry first.
    stop();
    const requestId = requestRef.current;
    const media =
      typeof navigator === "undefined" ? undefined : navigator.mediaDevices;

    const request = media?.getUserMedia
      ? media.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        })
      : Promise.reject(new Error("no-camera"));

    request
      .then(async (stream) => {
        if (requestRef.current !== requestId) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();

        if (requestRef.current !== requestId) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        // Function declaration so the loop can schedule itself.
        function loop() {
          frameRef.current = requestAnimationFrame(loop);
          // A lookup is in flight: keep the preview, stop decoding.
          if (pausedRef.current) return;
          const text = decodeFrame(videoRef.current, canvasRef.current);
          if (text) decodeRef.current(text);
        }

        frameRef.current = requestAnimationFrame(loop);
        setState("live");
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        stop();
        setState("offline");
      });
  }, [stop]);

  // Auto-start: a barista should not have to tap anything before scanning.
  useEffect(() => {
    attach();
    return stop;
  }, [attach, stop]);

  return (
    <div>
      {/* No camera: the box shrinks so the serial field moves into reach. */}
      <div
        className={
          state === "offline"
            ? "relative w-full overflow-hidden rounded-card bg-black py-9"
            : "relative aspect-square w-full overflow-hidden rounded-card bg-black"
        }
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={
            state === "live"
              ? "size-full object-cover"
              : state === "offline"
                ? "hidden"
                : "size-full object-cover opacity-0"
          }
        />
        <canvas ref={canvasRef} className="hidden" />

        {state === "live" && (
          <span className="pointer-events-none absolute inset-[14%] rounded-[18px] border-2 border-sage/80" />
        )}

        {state !== "live" && (
          <div
            className={
              state === "offline"
                ? "flex flex-col items-center justify-center gap-3 px-6 text-center"
                : "absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
            }
          >
            {state === "offline" ? (
              <CameraOff className="size-8 text-sage" strokeWidth={1.75} />
            ) : (
              <ScanLine className="size-8 text-sage" strokeWidth={1.75} />
            )}
            <p className="text-[13px] leading-[1.5] text-sage/85">
              {state === "offline" ? strings.offline : strings.starting}
            </p>
            {state === "offline" && (
              <button
                type="button"
                onClick={() => {
                  setState("starting");
                  attach();
                }}
                className="mt-1 flex items-center gap-2 rounded-btn border border-sage px-4 py-2.5 text-[13px] font-semibold text-sage"
              >
                <Camera className="size-4" strokeWidth={2} />
                {strings.retry}
              </button>
            )}
          </div>
        )}
      </div>

      {state === "live" && (
        <p className="mt-2.5 text-center text-[12.5px] font-semibold text-sage-deep">
          {strings.hint}
        </p>
      )}
    </div>
  );
}
