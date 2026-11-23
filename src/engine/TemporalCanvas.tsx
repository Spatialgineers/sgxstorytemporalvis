import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import {
  TEMPORAL_FRAGMENT_SHADER,
  TEMPORAL_VERTEX_SHADER,
} from './temporalShader';

export type SourceMode = 'demo' | 'camera' | 'upload';
export type CameraFacing = 'user' | 'environment';

export interface TemporalUniformConfig {
  decade: number;
  variant: number;
  intensity: number;
  scale: number;
  grain: number;
  tintHex: string;
  tintPower: number;
  splitEnabled: boolean;
  splitMode: number; // 0=1x, 1=ab, 2=2xV, 3=3x, 4=4x, 5=2xH, 6=6x, 7=9x, 8=mask
  splitX: number;
  splitY: number;
  zoneDecades: number[]; // length 9
  zoneVariants: number[]; // length 9
  activeZone: number;
  maskScale: number;
  maskOffsetX: number;
  maskOffsetY: number;
  maskInvert: boolean;
  maskFeather: number;
  maskEdge: boolean;
  maskEdgeColorHex: string;
  liteMode: boolean;
  reducedMotion: boolean;
  frameRatio: number;
  warpNonce: number;
  warpDirection: number;
}

export interface CaptureStampMeta {
  decadeLabel: string;
  title: string;
  variantLabel: string;
  medium: string;
  chapterTitle: string;
  stampEnabled: boolean;
}

export interface TriptychEraSlot {
  year: number;
  label: string;
  title: string;
  variant: number;
  variantLabel: string;
}

export interface TemporalCanvasHandle {
  capturePhoto: (meta: CaptureStampMeta) => string | null;
  captureTriptych: (slots: [TriptychEraSlot, TriptychEraSlot, TriptychEraSlot], chapterTitle: string) => string | null;
  startRecording: (onStop: (blobUrl: string, mimeType: string) => void) => boolean;
  stopRecording: () => void;
}

interface TemporalCanvasProps {
  sourceMode: SourceMode;
  plateSrc: string;
  uploadedMedia: { url: string; kind: 'image' | 'video' } | null;
  maskSrc: string | null;
  cameraFacing: CameraFacing;
  cameraRetryNonce: number;
  config: TemporalUniformConfig;
  onCameraError: (message: string) => void;
  onCameraReady: () => void;
  onTelemetry?: (info: { fps: number; width: number; height: number }) => void;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return { r: 0.992, g: 0.8, b: 0.051 };
  return {
    r: parseInt(match[1], 16) / 255,
    g: parseInt(match[2], 16) / 255,
    b: parseInt(match[3], 16) / 255,
  };
}

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function paintFallbackCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, '#05080F');
  grad.addColorStop(0.5, '#1A2638');
  grad.addColorStop(1, '#32527B');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(253, 204, 13, 0.22)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

export const TemporalCanvas = forwardRef<TemporalCanvasHandle, TemporalCanvasProps>(
  (
    {
      sourceMode,
      plateSrc,
      uploadedMedia,
      maskSrc,
      cameraFacing,
      cameraRetryNonce,
      config,
      onCameraError,
      onCameraReady,
      onTelemetry,
    },
    ref
  ) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const configRef = useRef<TemporalUniformConfig>(config);
    configRef.current = config;

    const onCameraErrorRef = useRef(onCameraError);
    onCameraErrorRef.current = onCameraError;
    const onCameraReadyRef = useRef(onCameraReady);
    onCameraReadyRef.current = onCameraReady;
    const onTelemetryRef = useRef(onTelemetry);
    onTelemetryRef.current = onTelemetry;

    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const materialRef = useRef<THREE.ShaderMaterial | null>(null);
    const texCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const textureRef = useRef<THREE.CanvasTexture | null>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const maskTextureRef = useRef<THREE.CanvasTexture | null>(null);
    const activeVideoRef = useRef<HTMLVideoElement | null>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const isSoftwareGlRef = useRef<boolean>(false);

    const warpLevelRef = useRef<number>(0);
    const lastWarpNonceRef = useRef<number>(config.warpNonce);

    const [webglUnavailable, setWebglUnavailable] = useState(false);

    // Sync config uniforms & trigger warp impulse when warpNonce increments
    useEffect(() => {
      const mat = materialRef.current;
      if (!mat) return;
      mat.uniforms.u_decade.value = config.decade;
      mat.uniforms.u_variant.value = config.variant;
      mat.uniforms.u_intensity.value = config.intensity;
      mat.uniforms.u_scale.value = config.scale;
      mat.uniforms.u_grain.value = config.grain;
      const rgb = hexToRgb(config.tintHex);
      mat.uniforms.u_tintColor.value.set(rgb.r, rgb.g, rgb.b);
      mat.uniforms.u_tintPower.value = config.tintPower;
      mat.uniforms.u_splitEnabled.value = config.splitEnabled ? 1.0 : 0.0;
      mat.uniforms.u_splitMode.value = config.splitMode;
      mat.uniforms.u_splitX.value = config.splitX;
      mat.uniforms.u_splitY.value = config.splitY;
      mat.uniforms.u_zoneDecades.value = config.zoneDecades.slice(0, 9);
      mat.uniforms.u_zoneVariants.value = config.zoneVariants.slice(0, 9);
      mat.uniforms.u_activeZone.value = config.activeZone;
      mat.uniforms.u_maskScale.value = config.maskScale;
      mat.uniforms.u_maskOffset.value.set(config.maskOffsetX, config.maskOffsetY);
      mat.uniforms.u_maskInvert.value = config.maskInvert ? 1.0 : 0.0;
      mat.uniforms.u_maskFeather.value = config.maskFeather;
      mat.uniforms.u_maskEdge.value = config.maskEdge ? 1.0 : 0.0;
      const edgeRgb = hexToRgb(config.maskEdgeColorHex);
      mat.uniforms.u_maskEdgeColor.value.set(edgeRgb.r, edgeRgb.g, edgeRgb.b);
      mat.uniforms.u_lite.value = config.liteMode ? 1.0 : 0.0;
      mat.uniforms.u_frameRatio.value = config.frameRatio;
      mat.uniforms.u_warpDir.value = config.warpDirection;

      if (config.warpNonce !== lastWarpNonceRef.current) {
        lastWarpNonceRef.current = config.warpNonce;
        if (!config.reducedMotion) {
          warpLevelRef.current = config.liteMode ? 0.55 : 1.0;
          mat.uniforms.u_warp.value = warpLevelRef.current;
        }
      }

      const renderer = rendererRef.current;
      if (renderer) {
        const targetDpr =
          isSoftwareGlRef.current || config.liteMode
            ? 1
            : Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(targetDpr);
        const mount = mountRef.current;
        if (mount) {
          renderer.setSize(mount.clientWidth, mount.clientHeight, false);
          mat.uniforms.u_resolution.value.set(mount.clientWidth, mount.clientHeight);
        }
      }
    }, [config]);

    // Initialize Three.js renderer once
    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      const isSoftwareGl = detectSoftwareWebGL();
      isSoftwareGlRef.current = isSoftwareGl;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: false,
          preserveDrawingBuffer: true,
          powerPreference: 'high-performance',
        });
      } catch {
        setWebglUnavailable(true);
        return;
      }

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(
        isSoftwareGl || configRef.current.liteMode
          ? 1
          : Math.min(window.devicePixelRatio || 1, 2)
      );
      renderer.setSize(
        mount.clientWidth || window.innerWidth,
        mount.clientHeight || window.innerHeight,
        false
      );
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      mount.innerHTML = '';
      mount.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      sceneRef.current = scene;
      cameraRef.current = camera;

      const texCanvas = document.createElement('canvas');
      paintFallbackCanvas(texCanvas);
      texCanvasRef.current = texCanvas;

      const createTextureFromCanvas = (canvas: HTMLCanvasElement) => {
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.NoColorSpace;
        tex.needsUpdate = true;
        return tex;
      };

      const texture = createTextureFromCanvas(texCanvas);
      textureRef.current = texture;

      // Initialize default transparent RGBA mask canvas (64x64 fallback circle)
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = 64;
      maskCanvas.height = 64;
      const mCtx = maskCanvas.getContext('2d');
      if (mCtx) {
        mCtx.clearRect(0, 0, 64, 64);
        mCtx.fillStyle = '#FFFFFF';
        mCtx.beginPath();
        mCtx.arc(32, 32, 24, 0, Math.PI * 2);
        mCtx.fill();
      }
      maskCanvasRef.current = maskCanvas;
      const maskTexture = createTextureFromCanvas(maskCanvas);
      maskTextureRef.current = maskTexture;

      const initRgb = hexToRgb(configRef.current.tintHex);
      const initEdgeRgb = hexToRgb(configRef.current.maskEdgeColorHex);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: texture },
          tMask: { value: maskTexture },
          u_time: { value: 0 },
          u_decade: { value: configRef.current.decade },
          u_variant: { value: configRef.current.variant },
          u_intensity: { value: configRef.current.intensity },
          u_scale: { value: configRef.current.scale },
          u_grain: { value: configRef.current.grain },
          u_resolution: {
            value: new THREE.Vector2(
              mount.clientWidth || window.innerWidth,
              mount.clientHeight || window.innerHeight
            ),
          },
          u_mediaAspect: { value: 16 / 9 },
          u_flip: { value: 0.0 },
          u_tintColor: { value: new THREE.Vector3(initRgb.r, initRgb.g, initRgb.b) },
          u_tintPower: { value: configRef.current.tintPower },
          u_splitEnabled: { value: configRef.current.splitEnabled ? 1.0 : 0.0 },
          u_splitMode: { value: configRef.current.splitMode },
          u_splitX: { value: configRef.current.splitX },
          u_splitY: { value: configRef.current.splitY },
          u_zoneDecades: { value: configRef.current.zoneDecades.slice(0, 9) },
          u_zoneVariants: { value: configRef.current.zoneVariants.slice(0, 9) },
          u_activeZone: { value: configRef.current.activeZone },
          u_maskAspect: { value: 1.0 },
          u_maskScale: { value: configRef.current.maskScale },
          u_maskOffset: {
            value: new THREE.Vector2(
              configRef.current.maskOffsetX,
              configRef.current.maskOffsetY
            ),
          },
          u_maskInvert: { value: configRef.current.maskInvert ? 1.0 : 0.0 },
          u_maskFeather: { value: configRef.current.maskFeather },
          u_maskEdge: { value: configRef.current.maskEdge ? 1.0 : 0.0 },
          u_maskEdgeColor: {
            value: new THREE.Vector3(initEdgeRgb.r, initEdgeRgb.g, initEdgeRgb.b),
          },
          u_lite: { value: configRef.current.liteMode ? 1.0 : 0.0 },
          u_warp: { value: 0.0 },
          u_warpDir: { value: 1.0 },
          u_frameRatio: { value: configRef.current.frameRatio },
        },
        vertexShader: TEMPORAL_VERTEX_SHADER,
        fragmentShader: TEMPORAL_FRAGMENT_SHADER,
      });
      materialRef.current = material;

      const geometry = new THREE.PlaneGeometry(2, 2);
      const quad = new THREE.Mesh(geometry, material);
      scene.add(quad);

      const handleResize = () => {
        if (!mount) return;
        const w = mount.clientWidth || window.innerWidth;
        const h = mount.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        material.uniforms.u_resolution.value.set(w, h);
      };
      window.addEventListener('resize', handleResize);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
      };
      const handleContextRestored = () => {
        handleResize();
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const clock = new THREE.Clock();
      let frameId = 0;
      let disposed = false;
      let frameCount = 0;
      let lastTelemetryMs = performance.now();

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) {
              if (sync) gl.deleteSync(sync);
              return;
            }
            const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
            if (state === gl.UNSIGNALED) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }
          };
          frameId = window.setTimeout(poll, 5);
        } else {
          frameId = window.setTimeout(cb, 80);
        }
      }

      const tick = () => {
        if (disposed) return;

        if (!document.hidden) {
          const dt = Math.min(clock.getDelta(), 0.1);
          const vid = activeVideoRef.current;
          const activeTexCanvas = texCanvasRef.current;
          if (
            vid &&
            activeTexCanvas &&
            vid.readyState >= vid.HAVE_CURRENT_DATA &&
            vid.videoWidth > 0 &&
            vid.videoHeight > 0
          ) {
            const sizeChanged =
              activeTexCanvas.width !== vid.videoWidth ||
              activeTexCanvas.height !== vid.videoHeight;
            if (sizeChanged) {
              activeTexCanvas.width = vid.videoWidth;
              activeTexCanvas.height = vid.videoHeight;
              material.uniforms.u_mediaAspect.value = vid.videoWidth / vid.videoHeight;
            }
            const ctx = activeTexCanvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(vid, 0, 0, activeTexCanvas.width, activeTexCanvas.height);
            }
            if (sizeChanged) {
              const prevTex = textureRef.current;
              const nextTex = createTextureFromCanvas(activeTexCanvas);
              textureRef.current = nextTex;
              material.uniforms.tDiffuse.value = nextTex;
              prevTex?.dispose();
            } else if (textureRef.current) {
              textureRef.current.needsUpdate = true;
            }
          }

          if (!configRef.current.reducedMotion) {
            material.uniforms.u_time.value += dt;
          }

          if (warpLevelRef.current > 0.002) {
            warpLevelRef.current *= Math.exp(-5.4 * dt);
            if (warpLevelRef.current < 0.004) warpLevelRef.current = 0;
            material.uniforms.u_warp.value = warpLevelRef.current;
          }

          renderer.render(scene, camera);
          frameCount++;

          const now = performance.now();
          if (now - lastTelemetryMs >= 500) {
            const fps = Math.round((frameCount * 1000) / (now - lastTelemetryMs));
            frameCount = 0;
            lastTelemetryMs = now;
            onTelemetryRef.current?.({
              fps,
              width: texCanvasRef.current?.width || 1280,
              height: texCanvasRef.current?.height || 720,
            });
          }
        }

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      };

      tick();

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        window.removeEventListener('resize', handleResize);
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
        if (cameraStreamRef.current) {
          cameraStreamRef.current.getTracks().forEach((t) => t.stop());
          cameraStreamRef.current = null;
        }
        geometry.dispose();
        material.dispose();
        textureRef.current?.dispose();
        maskTextureRef.current?.dispose();
        renderer.dispose();
      };
    }, []);

    // Load Transparent PNG/WebP/SVG Alpha Mask into tMask (auto-falls back to luma if image has no alpha)
    useEffect(() => {
      if (!maskSrc) return;
      let cancelled = false;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        const maskCanvas = maskCanvasRef.current;
        const mat = materialRef.current;
        if (!maskCanvas || !mat) return;

        const maxDim = 1024;
        let w = img.naturalWidth || 512;
        let h = img.naturalHeight || 512;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }

        const sizeChanged = maskCanvas.width !== w || maskCanvas.height !== h;
        maskCanvas.width = w;
        maskCanvas.height = h;
        const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          // Convert any colored transparent PNG (like the official SGX Pillar emblems) into a clean
          // pure-alpha silhouette mask (ignoring RGB fill colors). If the image has no alpha channel
          // at all (e.g. opaque B&W JPG), automatically derive alpha from pixel luminance.
          try {
            const imgData = ctx.getImageData(0, 0, w, h);
            const data = imgData.data;
            let hasTransparency = false;
            const step = Math.max(4, Math.floor(data.length / 4000) * 4);
            for (let i = 3; i < data.length; i += step) {
              if (data[i] < 245) {
                hasTransparency = true;
                break;
              }
            }
            if (hasTransparency) {
              for (let i = 0; i < data.length; i += 4) {
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
              }
            } else {
              for (let i = 0; i < data.length; i += 4) {
                const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                data[i] = 255;
                data[i + 1] = 255;
                data[i + 2] = 255;
                data[i + 3] = Math.round(lum);
              }
            }
            ctx.putImageData(imgData, 0, 0);
          } catch {
            // Keep raw drawn alpha if cross-origin prevents pixel inspection
          }
        }

        mat.uniforms.u_maskAspect.value = w / Math.max(h, 1);
        if (sizeChanged || !maskTextureRef.current) {
          const prevTex = maskTextureRef.current;
          const nextTex = new THREE.CanvasTexture(maskCanvas);
          nextTex.minFilter = THREE.LinearFilter;
          nextTex.magFilter = THREE.LinearFilter;
          nextTex.generateMipmaps = false;
          nextTex.colorSpace = THREE.NoColorSpace;
          nextTex.needsUpdate = true;
          maskTextureRef.current = nextTex;
          mat.uniforms.tMask.value = nextTex;
          prevTex?.dispose();
        } else {
          maskTextureRef.current.needsUpdate = true;
        }

        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      };
      img.src = maskSrc;

      return () => {
        cancelled = true;
      };
    }, [maskSrc]);

    // Switch media source (Demo Plate, Live Camera, or Uploaded Image/Video)
    useEffect(() => {
      let cancelled = false;

      const stopActiveStream = () => {
        if (cameraStreamRef.current) {
          cameraStreamRef.current.getTracks().forEach((t) => t.stop());
          cameraStreamRef.current = null;
        }
        if (activeVideoRef.current) {
          activeVideoRef.current.pause();
          activeVideoRef.current.srcObject = null;
          activeVideoRef.current.removeAttribute('src');
          activeVideoRef.current = null;
        }
      };

      const rebuildCanvasTexture = (canvas: HTMLCanvasElement) => {
        const mat = materialRef.current;
        if (!mat) return;
        const prevTex = textureRef.current;
        const nextTex = new THREE.CanvasTexture(canvas);
        nextTex.minFilter = THREE.LinearFilter;
        nextTex.magFilter = THREE.LinearFilter;
        nextTex.generateMipmaps = false;
        nextTex.colorSpace = THREE.NoColorSpace;
        nextTex.needsUpdate = true;
        textureRef.current = nextTex;
        mat.uniforms.tDiffuse.value = nextTex;
        prevTex?.dispose();
      };

      const drawImageToTexture = (img: HTMLImageElement) => {
        const texCanvas = texCanvasRef.current;
        const mat = materialRef.current;
        if (!texCanvas || !mat) return;

        const maxDim = 1920;
        let w = img.naturalWidth || 1280;
        let h = img.naturalHeight || 720;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const sizeChanged = texCanvas.width !== w || texCanvas.height !== h;
        texCanvas.width = w;
        texCanvas.height = h;
        const ctx = texCanvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
        }
        mat.uniforms.u_mediaAspect.value = w / h;
        mat.uniforms.u_flip.value = 0.0;

        if (sizeChanged || !textureRef.current) {
          rebuildCanvasTexture(texCanvas);
        } else {
          textureRef.current.needsUpdate = true;
        }

        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      };

      stopActiveStream();

      if (sourceMode === 'demo') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (!cancelled) drawImageToTexture(img);
        };
        img.onerror = () => {
          if (!cancelled && texCanvasRef.current) {
            paintFallbackCanvas(texCanvasRef.current);
            rebuildCanvasTexture(texCanvasRef.current);
          }
        };
        img.src = plateSrc;
      } else if (sourceMode === 'upload' && uploadedMedia) {
        if (uploadedMedia.kind === 'image') {
          const img = new Image();
          img.onload = () => {
            if (!cancelled) drawImageToTexture(img);
          };
          img.src = uploadedMedia.url;
        } else {
          const vid = document.createElement('video');
          vid.src = uploadedMedia.url;
          vid.loop = true;
          vid.muted = true;
          vid.playsInline = true;
          vid.autoplay = true;
          vid.onloadedmetadata = () => {
            if (cancelled) return;
            const mat = materialRef.current;
            if (mat && vid.videoWidth > 0) {
              mat.uniforms.u_mediaAspect.value = vid.videoWidth / vid.videoHeight;
              mat.uniforms.u_flip.value = 0.0;
            }
            activeVideoRef.current = vid;
            vid.play().catch(() => {});
          };
        }
      } else if (sourceMode === 'camera') {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          onCameraErrorRef.current(
            'Tu navegador no permite acceso a la cámara en este contexto. Usa una placa de estudio o sube una foto/video.'
          );
          return;
        }

        navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: cameraFacing,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          })
          .then((stream) => {
            if (cancelled) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            cameraStreamRef.current = stream;
            const vid = document.createElement('video');
            vid.srcObject = stream;
            vid.muted = true;
            vid.playsInline = true;
            vid.autoplay = true;
            vid.onloadedmetadata = () => {
              if (cancelled) return;
              const mat = materialRef.current;
              if (mat) {
                mat.uniforms.u_flip.value = cameraFacing === 'user' ? 1.0 : 0.0;
                if (vid.videoWidth > 0) {
                  mat.uniforms.u_mediaAspect.value = vid.videoWidth / vid.videoHeight;
                }
              }
              activeVideoRef.current = vid;
              vid.play().catch(() => {});
              onCameraReadyRef.current();
            };
          })
          .catch(() => {
            if (!cancelled) {
              onCameraErrorRef.current(
                'Permiso de cámara denegado o sin dispositivo detectado. Puedes seguir usando las placas de estudio o subir un archivo.'
              );
            }
          });
      }

      return () => {
        cancelled = true;
        stopActiveStream();
      };
    }, [sourceMode, plateSrc, uploadedMedia, cameraFacing, cameraRetryNonce]);

    useImperativeHandle(ref, () => ({
      capturePhoto: (meta: CaptureStampMeta) => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const mat = materialRef.current;
        if (!renderer || !scene || !camera || !mat) return null;

        const prevWarp = mat.uniforms.u_warp.value;
        mat.uniforms.u_warp.value = 0.0;
        renderer.render(scene, camera);
        mat.uniforms.u_warp.value = prevWarp;

        const srcCanvas = renderer.domElement;
        if (!meta.stampEnabled) {
          return srcCanvas.toDataURL('image/jpeg', 0.92);
        }

        const out = document.createElement('canvas');
        out.width = srcCanvas.width;
        out.height = srcCanvas.height;
        const ctx = out.getContext('2d');
        if (!ctx) return srcCanvas.toDataURL('image/jpeg', 0.92);

        ctx.drawImage(srcCanvas, 0, 0);

        const pad = Math.round(Math.min(out.width, out.height) * 0.03);
        const fontSize = Math.max(14, Math.round(out.height * 0.022));
        const barH = Math.round(fontSize * 3.1);

        // SGX.Story optical bottom postcard strip
        ctx.fillStyle = 'rgba(5, 5, 5, 0.86)';
        ctx.fillRect(0, out.height - barH, out.width, barH);
        ctx.fillStyle = '#32527B';
        ctx.fillRect(0, out.height - barH, out.width, 2);

        // Left: Era + Custom Chapter Title
        ctx.textBaseline = 'top';
        ctx.font = `900 ${Math.round(fontSize * 1.1)}px Orbitron, sans-serif`;
        ctx.fillStyle = '#FDCC0D';
        ctx.fillText(
          `SGX.STORY // ${meta.decadeLabel}`,
          pad,
          out.height - barH + Math.round(fontSize * 0.45)
        );

        const subtitle = meta.chapterTitle.trim()
          ? meta.chapterTitle.trim().toUpperCase()
          : `${meta.title.toUpperCase()} · ${meta.variantLabel.toUpperCase()}`;
        ctx.font = `600 ${Math.round(fontSize * 0.72)}px "Chakra Petch", sans-serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(
          subtitle,
          pad,
          out.height - barH + Math.round(fontSize * 1.75)
        );

        // Right: Optical medium + motto
        ctx.textAlign = 'right';
        ctx.font = `600 ${Math.round(fontSize * 0.75)}px "Share Tech Mono", monospace`;
        ctx.fillStyle = '#00DDFF';
        ctx.fillText(
          `${meta.medium} // ${meta.variantLabel.toUpperCase()}`,
          out.width - pad,
          out.height - barH + Math.round(fontSize * 0.52)
        );

        ctx.font = `400 ${Math.round(fontSize * 0.65)}px "Exo 2", sans-serif`;
        ctx.fillStyle = '#A3A3A3';
        ctx.fillText(
          'TODA INNOVACIÓN NECESITA UNA HISTORIA · SPATIALGINEERS',
          out.width - pad,
          out.height - barH + Math.round(fontSize * 1.78)
        );

        return out.toDataURL('image/jpeg', 0.93);
      },

      captureTriptych: (slots, chapterTitle) => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const mat = materialRef.current;
        if (!renderer || !scene || !camera || !mat) return null;

        // Snapshot current uniform states to restore cleanly
        const savedDecade = mat.uniforms.u_decade.value;
        const savedVariant = mat.uniforms.u_variant.value;
        const savedSplit = mat.uniforms.u_splitEnabled.value;
        const savedSplitMode = mat.uniforms.u_splitMode.value;
        const savedWarp = mat.uniforms.u_warp.value;
        const savedFrame = mat.uniforms.u_frameRatio.value;

        const outW = 1920;
        const outH = 880;
        const out = document.createElement('canvas');
        out.width = outW;
        out.height = outH;
        const ctx = out.getContext('2d');
        if (!ctx) return null;

        // SGX Dark Base + 40px Blueprint Grid
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, outW, outH);
        ctx.strokeStyle = 'rgba(50, 82, 123, 0.28)';
        ctx.lineWidth = 1;
        for (let x = 0; x < outW; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, outH);
          ctx.stroke();
        }
        for (let y = 0; y < outH; y += 40) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(outW, y);
          ctx.stroke();
        }

        // Top Header
        ctx.fillStyle = '#FDCC0D';
        ctx.font = '900 30px Orbitron, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText('SGX.STORY // TRÍPTICO TEMPORAL', 48, 36);

        ctx.fillStyle = '#00DDFF';
        ctx.font = '400 18px "Share Tech Mono", monospace';
        ctx.textAlign = 'right';
        const caption = chapterTitle.trim() || 'TODA INNOVACIÓN NECESITA UNA HISTORIA';
        ctx.fillText(caption.toUpperCase(), outW - 48, 44);
        ctx.textAlign = 'left';

        ctx.fillStyle = '#32527B';
        ctx.fillRect(48, 84, outW - 96, 2);

        const gap = 24;
        const panelW = Math.floor((outW - 96 - gap * 2) / 3);
        const panelH = 620;
        const topY = 112;

        mat.uniforms.u_splitEnabled.value = 0.0;
        mat.uniforms.u_splitMode.value = 0.0;
        mat.uniforms.u_warp.value = 0.0;
        mat.uniforms.u_frameRatio.value = 0.0;

        slots.forEach((slot, idx) => {
          mat.uniforms.u_decade.value = slot.year;
          mat.uniforms.u_variant.value = slot.variant;
          renderer.render(scene, camera);

          const x = 48 + idx * (panelW + gap);
          const src = renderer.domElement;

          // Center-crop src canvas into panelW x panelH
          const srcAspect = src.width / Math.max(src.height, 1);
          const dstAspect = panelW / panelH;
          let sx = 0;
          let sy = 0;
          let sw = src.width;
          let sh = src.height;
          if (srcAspect > dstAspect) {
            sw = src.height * dstAspect;
            sx = (src.width - sw) * 0.5;
          } else {
            sh = src.width / dstAspect;
            sy = (src.height - sh) * 0.5;
          }

          ctx.drawImage(src, sx, sy, sw, sh, x, topY, panelW, panelH);

          // SGX Panel frame + corner accents
          ctx.strokeStyle = idx === 1 ? '#FDCC0D' : '#32527B';
          ctx.lineWidth = idx === 1 ? 2 : 1.5;
          ctx.strokeRect(x, topY, panelW, panelH);

          // Bottom metadata plate under each panel
          ctx.fillStyle = '#12151C';
          ctx.fillRect(x, topY + panelH, panelW, 84);
          ctx.strokeStyle = '#32527B';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, topY + panelH, panelW, 84);

          ctx.fillStyle = idx === 1 ? '#FDCC0D' : '#FFFFFF';
          ctx.font = '900 26px Orbitron, sans-serif';
          ctx.fillText(slot.label, x + 18, topY + panelH + 14);

          ctx.fillStyle = '#00DDFF';
          ctx.font = '400 15px "Share Tech Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(`0${idx + 1}`, x + panelW - 18, topY + panelH + 20);
          ctx.textAlign = 'left';

          ctx.fillStyle = '#A3A3A3';
          ctx.font = '600 15px "Chakra Petch", sans-serif';
          ctx.fillText(
            `${slot.title.toUpperCase()} · ${slot.variantLabel.toUpperCase()}`,
            x + 18,
            topY + panelH + 50
          );
        });

        // Footer
        ctx.fillStyle = '#888888';
        ctx.font = '400 14px "Share Tech Mono", monospace';
        ctx.fillText('SPATIALGINEERS // SGX.STORY VISUALIZADOR TEMPORAL', 48, outH - 36);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FDCC0D';
        ctx.fillText('INGENIANDO IMAGINACIÓN, CONSTRUYENDO REALIDADES', outW - 48, outH - 36);

        // Restore live shader uniforms immediately
        mat.uniforms.u_decade.value = savedDecade;
        mat.uniforms.u_variant.value = savedVariant;
        mat.uniforms.u_splitEnabled.value = savedSplit;
        mat.uniforms.u_splitMode.value = savedSplitMode;
        mat.uniforms.u_warp.value = savedWarp;
        mat.uniforms.u_frameRatio.value = savedFrame;
        renderer.render(scene, camera);

        return out.toDataURL('image/jpeg', 0.93);
      },

      startRecording: (onStop) => {
        const renderer = rendererRef.current;
        if (!renderer || typeof MediaRecorder === 'undefined') return false;

        try {
          recordedChunksRef.current = [];
          const stream = renderer.domElement.captureStream(30);
          let mimeType = 'video/webm;codecs=vp9';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'video/mp4';
            }
          }
          const recorder = new MediaRecorder(stream, { mimeType });
          recorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
          };
          recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: mimeType });
            const url = URL.createObjectURL(blob);
            onStop(url, mimeType);
          };
          recorder.start();
          mediaRecorderRef.current = recorder;
          return true;
        } catch {
          return false;
        }
      },

      stopRecording: () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      },
    }));

    if (webglUnavailable) {
      return (
        <div className="absolute inset-0 sgx-stage flex items-center justify-center p-6">
          <div className="sgx-panel sgx-panel--solid max-w-md p-6 text-center">
            <h2 className="font-display text-lg font-bold tracking-wider uppercase text-sgx-yellow mb-2">
              WebGL No Disponible
            </h2>
            <p className="text-sm text-[var(--ink-muted)]">
              Tu navegador tiene desactivada la aceleración WebGL necesaria para el motor de shaders temporales de SGX.Story.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={mountRef}
        className="absolute inset-0 w-full h-full sgx-stage"
        aria-label="Visor WebGL temporal SGX.Story"
      />
    );
  }
);

TemporalCanvas.displayName = 'TemporalCanvas';
