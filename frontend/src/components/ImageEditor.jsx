import { useState, useRef, useEffect, useCallback } from 'react';
import { pictureService } from '../services/api';
import { inpaint } from '../lib/inpaint';
import ConfirmModal from './ConfirmModal';
import { ToastContainer, useToast } from './Toast';
import './ImageEditor.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const HANDLE_SIZE = 12;
const EDGE_THRESHOLD = 8;

/**
 * ImageEditor Component
 * Provides crop, rotate, and blur functionality for images
 *
 * Props:
 * - imageUrl: URL of the image to edit (not used directly, we use proxy)
 * - onSave: Callback with edited image blob and metadata
 * - onCancel: Callback when editing is cancelled
 * - pictureId: ID of the picture being edited
 */
const ImageEditor = ({ imageUrl, onSave, onCancel, pictureId, saveError = '' }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Crop state
  const [isCropping, setIsCropping] = useState(false);
  const [cropStart, setCropStart] = useState(null);
  const [cropEnd, setCropEnd] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState(null);
  const [dragStart, setDragStart] = useState(null);

  // Blur state
  const [isBlurring, setIsBlurring] = useState(false);
  const [blurRegions, setBlurRegions] = useState([]); // Array of {x, y, w, h, shape: 'rect'|'circle'}
  const [currentBlurRegion, setCurrentBlurRegion] = useState(null);
  const [blurIntensity, setBlurIntensity] = useState(15);
  const [blurShape, setBlurShape] = useState('rect'); // 'rect' or 'circle'
  const [selectedBlurIndex, setSelectedBlurIndex] = useState(-1); // Index of selected blur region for resize/move
  const [blurHandle, setBlurHandle] = useState(null); // Which handle is being dragged
  const [blurDragStart, setBlurDragStart] = useState(null); // Starting position for blur drag

  // Perspective correction state — 4 corners in display coords (TL, TR, BR, BL)
  const [isPerspective, setIsPerspective] = useState(false);
  const [perspectiveCorners, setPerspectiveCorners] = useState(null);
  const [activePerspectiveCorner, setActivePerspectiveCorner] = useState(-1);

  // Healing brush state
  const [isHealing, setIsHealing] = useState(false);
  const [healBrushSize, setHealBrushSize] = useState(15);
  const [isProcessingHeal, setIsProcessingHeal] = useState(false);
  const [isErasingMask, setIsErasingMask] = useState(false);
  const maskCanvasRef = useRef(null);
  const isPaintingMask = useRef(false);
  const lastMaskPos = useRef(null);
  const wasErasingRef = useRef(false);
  const [hasMask, setHasMask] = useState(false);

  // Magic background state
  const [isMagicOpen, setIsMagicOpen] = useState(false);
  const [magicIntensity, setMagicIntensity] = useState(50); // 0-100
  const [shadowRemoval, setShadowRemoval] = useState(0); // 0-100 — flat-field illumination correction

  // Zoom state for the canvas (1.0 = fit, up to 3.0 = 300%)
  const [zoom, setZoom] = useState(1);

  // Undo/Redo state
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const MAX_UNDO = 15;

  // Original image restoration
  const [hasOriginal, setHasOriginal] = useState(false);
  const [restoringOriginal, setRestoringOriginal] = useState(false);

  // Image dimensions for display
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });

  const [loadError, setLoadError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const { toasts, addToast, removeToast } = useToast();

  // Check if original image is available for restoration
  useEffect(() => {
    const checkOriginal = async () => {
      if (pictureId) {
        try {
          const result = await pictureService.hasOriginal(pictureId);
          setHasOriginal(result.hasOriginal);
        } catch (err) {
          console.error('Failed to check original status:', err);
        }
      }
    };
    checkOriginal();
  }, [pictureId]);

  // Load image via backend proxy to avoid CORS issues with canvas
  useEffect(() => {
    let isMounted = true;
    let objectUrl = null;

    const loadImage = async () => {
      try {
        setLoadError(null);
        setImageLoaded(false);

        // Use the backend proxy endpoint which handles CORS properly
        const proxyUrl = `${API_URL}/api/pictures/${pictureId}/image-proxy`;
        const token = localStorage.getItem('token');

        const response = await fetch(proxyUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (!isMounted) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setBlobUrl(objectUrl);

        const img = new Image();
        img.onload = () => {
          if (!isMounted) return;
          imageRef.current = img;
          setOriginalSize({ width: img.width, height: img.height });
          setImageLoaded(true);
        };
        img.onerror = () => {
          if (!isMounted) return;
          console.error('Failed to load image for editing');
          setLoadError('Failed to load image from blob');
        };
        img.src = objectUrl;
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to fetch image:', err);
        setLoadError(err.message || 'Failed to load image');
      }
    };

    if (pictureId) {
      loadImage();
    }

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [pictureId]);

  // Cleanup blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Calculate display size based on container + zoom
  useEffect(() => {
    if (!imageLoaded || !containerRef.current) return;

    const container = containerRef.current;
    // Reserve space for the right-side zoom sidebar (56px)
    const maxWidth = container.clientWidth - 40 - 56;
    const maxHeight = window.innerHeight - 350;

    let { width, height } = originalSize;

    // Account for rotation
    if (rotation % 180 !== 0) {
      [width, height] = [height, width];
    }

    const fitScale = Math.min(maxWidth / width, maxHeight / height, 1);
    const scale = fitScale * zoom;

    setDisplaySize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    });
  }, [imageLoaded, originalSize, rotation, zoom]);

  // Helper to check if point is near a position
  const isNearPoint = (pos, px, py, threshold = HANDLE_SIZE) => {
    return Math.abs(pos.x - px) < threshold && Math.abs(pos.y - py) < threshold;
  };

  // Get which crop handle is at position
  const getHandleAtPosition = useCallback((pos) => {
    if (!cropStart || !cropEnd) return null;

    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);

    // Check corner handles (priority)
    if (isNearPoint(pos, x, y)) return 'nw';
    if (isNearPoint(pos, x + w, y)) return 'ne';
    if (isNearPoint(pos, x, y + h)) return 'sw';
    if (isNearPoint(pos, x + w, y + h)) return 'se';

    // Check edge handles
    if (isNearPoint(pos, x + w / 2, y, EDGE_THRESHOLD)) return 'n';
    if (isNearPoint(pos, x + w / 2, y + h, EDGE_THRESHOLD)) return 's';
    if (isNearPoint(pos, x, y + h / 2, EDGE_THRESHOLD)) return 'w';
    if (isNearPoint(pos, x + w, y + h / 2, EDGE_THRESHOLD)) return 'e';

    // Check if inside crop area (for moving)
    if (pos.x > x && pos.x < x + w && pos.y > y && pos.y < y + h) {
      return 'move';
    }

    return null;
  }, [cropStart, cropEnd]);

  // Get cursor for handle
  const getCursorForHandle = (handle) => {
    const cursors = {
      'nw': 'nwse-resize',
      'se': 'nwse-resize',
      'ne': 'nesw-resize',
      'sw': 'nesw-resize',
      'n': 'ns-resize',
      's': 'ns-resize',
      'e': 'ew-resize',
      'w': 'ew-resize',
      'move': 'move',
    };
    return cursors[handle] || 'crosshair';
  };

  // Quick blur for preview (fewer passes, smaller radius)
  const applyBoxBlurPreview = (imageData, radius) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const copy = new Uint8ClampedArray(data);

    // Single pass for preview performance
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, count = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const sx = Math.max(0, Math.min(width - 1, x + dx));
            const sy = Math.max(0, Math.min(height - 1, y + dy));
            const idx = (sy * width + sx) * 4;
            r += copy[idx];
            g += copy[idx + 1];
            b += copy[idx + 2];
            count++;
          }
        }

        const idx = (y * width + x) * 4;
        data[idx] = r / count;
        data[idx + 1] = g / count;
        data[idx + 2] = b / count;
      }
    }

    return imageData;
  };

  // Capture current state for undo stack
  const captureState = useCallback(() => {
    const img = imageRef.current;
    if (!img) return null;

    const canvas = document.createElement('canvas');
    let w = img.width, h = img.height;
    if (rotation % 180 !== 0) [w, h] = [h, w];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.translate(w / 2, h / 2);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    return canvas.toDataURL('image/jpeg', 0.92);
  }, [rotation, flipH, flipV]);

  // Push current state to undo stack before destructive operations
  const pushUndo = useCallback(() => {
    const dataUrl = captureState();
    if (!dataUrl) return;
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), dataUrl]);
    setRedoStack([]);
  }, [captureState]);

  // Helper to clear mask canvas without triggering drawImage
  const clearMaskCanvas = useCallback(() => {
    if (maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    }
    setHasMask(false);
  }, []);

  // Undo last operation
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;

    // Save current state to redo
    const currentDataUrl = captureState();
    if (currentDataUrl) {
      setRedoStack(prev => [...prev, currentDataUrl]);
    }

    // Pop last undo state
    const dataUrl = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setOriginalSize({ width: img.width, height: img.height });
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setBlurRegions([]);
      setCropStart(null);
      setCropEnd(null);
      clearMaskCanvas();
    };
    img.src = dataUrl;
  }, [undoStack, captureState, clearMaskCanvas]);

  // Redo last undone operation
  const redo = useCallback(() => {
    if (redoStack.length === 0) return;

    // Save current state to undo
    const currentDataUrl = captureState();
    if (currentDataUrl) {
      setUndoStack(prev => [...prev, currentDataUrl]);
    }

    // Pop last redo state
    const dataUrl = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setOriginalSize({ width: img.width, height: img.height });
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setBlurRegions([]);
      setCropStart(null);
      setCropEnd(null);
      clearMaskCanvas();
    };
    img.src = dataUrl;
  }, [redoStack, captureState, clearMaskCanvas]);

  // Draw the image on canvas
  // Core pixel transform used by both live preview and final apply.
  // Mutates the passed imageData in place.
  // `config` accepts a number (legacy: just whitening intensity) or an
  // object { intensity, shadowRemoval } both 0-100.
  // Declared before drawImage because drawImage's dep array references it.
  const transformMagicBackground = useCallback((imageData, config) => {
    const cfg = typeof config === 'number' ? { intensity: config, shadowRemoval: 0 } : (config || {});
    const t = Math.max(0, Math.min(100, cfg.intensity ?? 0)) / 100;
    const sFlat = Math.max(0, Math.min(100, cfg.shadowRemoval ?? 0)) / 100;
    const data = imageData.data;
    const W = imageData.width;
    const H = imageData.height;

    // ---------- Pass 1: shadow / illumination flat-field correction ----------
    // Build a low-resolution illumination map by taking, in each tile, the
    // brightest pixel found inside that tile. That brightest value approximates
    // "the color of the paper at this spot if there were no ink." Then smooth
    // that map and divide every source pixel by it so the paper becomes uniform.
    if (sFlat > 0) {
      const TILE = 24;                    // tile size in pixels
      const cols = Math.max(1, Math.ceil(W / TILE));
      const rows = Math.max(1, Math.ceil(H / TILE));
      const illumR = new Float32Array(cols * rows);
      const illumG = new Float32Array(cols * rows);
      const illumB = new Float32Array(cols * rows);

      // Initialize with image min so max-filter works
      illumR.fill(0); illumG.fill(0); illumB.fill(0);

      // Max-pool each tile, weighted by luminance
      for (let ty = 0; ty < rows; ty++) {
        const y0 = ty * TILE;
        const y1 = Math.min(H, y0 + TILE);
        for (let tx = 0; tx < cols; tx++) {
          const x0 = tx * TILE;
          const x1 = Math.min(W, x0 + TILE);
          let bestLum = -1, bestR = 220, bestG = 220, bestB = 220;
          // Subsample inside the tile for speed (every 3rd pixel)
          for (let y = y0; y < y1; y += 3) {
            for (let x = x0; x < x1; x += 3) {
              const i = (y * W + x) * 4;
              const r = data[i], g = data[i + 1], b = data[i + 2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              if (lum > bestLum) {
                bestLum = lum;
                bestR = r; bestG = g; bestB = b;
              }
            }
          }
          const idx = ty * cols + tx;
          illumR[idx] = bestR;
          illumG[idx] = bestG;
          illumB[idx] = bestB;
        }
      }

      // Smooth the illumination map with a few box-blur passes — this is what
      // turns a tile mosaic into a soft gradient.
      const blurMap = (src) => {
        const out = new Float32Array(src.length);
        const radius = 2;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            let sum = 0, n = 0;
            for (let dy = -radius; dy <= radius; dy++) {
              const yy = Math.max(0, Math.min(rows - 1, y + dy));
              for (let dx = -radius; dx <= radius; dx++) {
                const xx = Math.max(0, Math.min(cols - 1, x + dx));
                sum += src[yy * cols + xx];
                n++;
              }
            }
            out[y * cols + x] = sum / n;
          }
        }
        return out;
      };
      let mR = illumR, mG = illumG, mB = illumB;
      for (let p = 0; p < 3; p++) {
        mR = blurMap(mR);
        mG = blurMap(mG);
        mB = blurMap(mB);
      }

      // Find the global brightest tile across the (smoothed) map — that's our target white.
      let targetR = 240, targetG = 240, targetB = 240;
      let bestTargetLum = -1;
      for (let i = 0; i < mR.length; i++) {
        const lum = 0.299 * mR[i] + 0.587 * mG[i] + 0.114 * mB[i];
        if (lum > bestTargetLum) {
          bestTargetLum = lum;
          targetR = mR[i]; targetG = mG[i]; targetB = mB[i];
        }
      }
      // Divide every pixel by its bilinearly-interpolated illumination, scaled
      // so the brightest tile maps to ~target white. Blend with the original
      // by shadowRemoval intensity.
      const sampleIllum = (x, y, mapArr) => {
        // Map pixel coords → tile coords, sampling tile centers
        const fx = x / TILE - 0.5;
        const fy = y / TILE - 0.5;
        const ix = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
        const iy = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
        const ix1 = Math.min(cols - 1, ix + 1);
        const iy1 = Math.min(rows - 1, iy + 1);
        const tx = Math.max(0, Math.min(1, fx - ix));
        const ty = Math.max(0, Math.min(1, fy - iy));
        const v00 = mapArr[iy * cols + ix];
        const v10 = mapArr[iy * cols + ix1];
        const v01 = mapArr[iy1 * cols + ix];
        const v11 = mapArr[iy1 * cols + ix1];
        return (
          v00 * (1 - tx) * (1 - ty) +
          v10 * tx * (1 - ty) +
          v01 * (1 - tx) * ty +
          v11 * tx * ty
        );
      };

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const lr = Math.max(1, sampleIllum(x, y, mR));
          const lg = Math.max(1, sampleIllum(x, y, mG));
          const lb = Math.max(1, sampleIllum(x, y, mB));

          const correctedR = (data[i]     / lr) * targetR;
          const correctedG = (data[i + 1] / lg) * targetG;
          const correctedB = (data[i + 2] / lb) * targetB;

          // Blend toward correction by sFlat
          data[i]     = Math.max(0, Math.min(255, data[i]     * (1 - sFlat) + correctedR * sFlat));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * (1 - sFlat) + correctedG * sFlat));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * (1 - sFlat) + correctedB * sFlat));
        }
      }
    }

    // ---------- Pass 2: paper whitening + contrast (existing behavior) ----------
    if (t === 0) return;

    let sum = 0;
    let count = 0;
    const sampleStep = Math.max(1, Math.floor(Math.sqrt(data.length / 4) / 200));
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 150) { sum += lum; count++; }
    }
    const paperLum = count > 0 ? sum / count : 220;
    const gain = Math.min((255 / paperLum - 1) * t + 1, 1.8);
    const whiteCut = 230 - 60 * t;
    const contrast = 1 + 0.6 * t;
    const midpoint = 128;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] * gain;
      let g = data[i + 1] * gain;
      let b = data[i + 2] * gain;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum >= whiteCut) {
        const k = Math.min(1, (lum - whiteCut) / (255 - whiteCut));
        r = r + (255 - r) * k;
        g = g + (255 - g) * k;
        b = b + (255 - b) * k;
      } else {
        r = midpoint + (r - midpoint) * contrast;
        g = midpoint + (g - midpoint) * contrast;
        b = midpoint + (b - midpoint) * contrast;
      }

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }
  }, []);

  const drawImage = useCallback(() => {
    if (!canvasRef.current || !imageRef.current || !imageLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    // Set canvas size to display size
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scale
    let srcWidth = img.width;
    let srcHeight = img.height;
    if (rotation % 180 !== 0) {
      [srcWidth, srcHeight] = [srcHeight, srcWidth];
    }

    const scale = displaySize.width / srcWidth;

    // Apply rotation and flip
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.rotate((rotation * Math.PI) / 180);

    // Draw image centered
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

    ctx.restore();

    // Draw blur region previews with live blur effect
    const allBlurRegions = [...blurRegions, currentBlurRegion].filter(Boolean);
    allBlurRegions.forEach((region, index) => {
      const rx = Math.min(region.x, region.x + region.w);
      const ry = Math.min(region.y, region.y + region.h);
      const rw = Math.abs(region.w);
      const rh = Math.abs(region.h);
      const shape = region.shape || 'rect';
      const isSelected = index === selectedBlurIndex && isBlurring;

      if (rw > 5 && rh > 5) {
        // Apply live blur preview to the region
        if (shape === 'circle') {
          const centerX = rx + rw / 2;
          const centerY = ry + rh / 2;
          const radiusX = rw / 2;
          const radiusY = rh / 2;

          const imageData = ctx.getImageData(rx, ry, rw, rh);
          const blurredData = applyBoxBlurPreview(imageData, Math.min(blurIntensity, 8));

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = rw;
          tempCanvas.height = rh;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.putImageData(blurredData, 0, 0);

          ctx.save();
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(tempCanvas, rx, ry);
          ctx.restore();

          // Draw circle border (thicker if selected)
          ctx.strokeStyle = isSelected ? '#fff' : '#ff6b6b';
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.setLineDash(isSelected ? [] : [4, 4]);
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw label
          ctx.fillStyle = '#ff6b6b';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('BLUR', rx + 4, ry + 14);

          // Draw resize handles if selected
          if (isSelected) {
            const handleSize = HANDLE_SIZE;
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = 2;

            // Corner handles
            const corners = [
              [rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]
            ];
            corners.forEach(([cx, cy]) => {
              ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
              ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
            });

            // Edge handles
            const edgeSize = 8;
            const edges = [
              [rx + rw / 2, ry], [rx + rw / 2, ry + rh],
              [rx, ry + rh / 2], [rx + rw, ry + rh / 2]
            ];
            edges.forEach(([cx, cy]) => {
              ctx.fillRect(cx - edgeSize / 2, cy - edgeSize / 2, edgeSize, edgeSize);
              ctx.strokeRect(cx - edgeSize / 2, cy - edgeSize / 2, edgeSize, edgeSize);
            });
          }
        } else {
          // Rectangle blur
          const imageData = ctx.getImageData(rx, ry, rw, rh);
          const blurredData = applyBoxBlurPreview(imageData, Math.min(blurIntensity, 8));
          ctx.putImageData(blurredData, rx, ry);

          // Draw border (thicker if selected)
          ctx.strokeStyle = isSelected ? '#fff' : '#ff6b6b';
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.setLineDash(isSelected ? [] : [4, 4]);
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.setLineDash([]);

          // Draw blur label
          ctx.fillStyle = '#ff6b6b';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('BLUR', rx + 4, ry + 14);

          // Draw resize handles if selected
          if (isSelected) {
            const handleSize = HANDLE_SIZE;
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = 2;

            // Corner handles
            const corners = [
              [rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]
            ];
            corners.forEach(([cx, cy]) => {
              ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
              ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
            });

            // Edge handles
            const edgeSize = 8;
            const edges = [
              [rx + rw / 2, ry], [rx + rw / 2, ry + rh],
              [rx, ry + rh / 2], [rx + rw, ry + rh / 2]
            ];
            edges.forEach(([cx, cy]) => {
              ctx.fillRect(cx - edgeSize / 2, cy - edgeSize / 2, edgeSize, edgeSize);
              ctx.strokeRect(cx - edgeSize / 2, cy - edgeSize / 2, edgeSize, edgeSize);
            });
          }
        }
      }
    });

    // Draw crop overlay if cropping
    if (isCropping && cropStart && cropEnd) {
      const x = Math.min(cropStart.x, cropEnd.x);
      const y = Math.min(cropStart.y, cropEnd.y);
      const w = Math.abs(cropEnd.x - cropStart.x);
      const h = Math.abs(cropEnd.y - cropStart.y);

      // Darken outside crop area
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, y);
      ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
      ctx.fillRect(0, y, x, h);
      ctx.fillRect(x + w, y, canvas.width - x - w, h);

      // Draw crop border
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // Draw corner handles
      const handleSize = HANDLE_SIZE;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#d4a574';
      ctx.lineWidth = 2;

      const corners = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ];
      corners.forEach(([cx, cy]) => {
        ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      });

      // Draw edge handles (smaller)
      const edgeSize = 8;
      const edges = [
        [x + w / 2, y],
        [x + w / 2, y + h],
        [x, y + h / 2],
        [x + w, y + h / 2],
      ];
      edges.forEach(([cx, cy]) => {
        ctx.fillRect(cx - edgeSize / 2, cy - edgeSize / 2, edgeSize, edgeSize);
        ctx.strokeRect(cx - edgeSize / 2, cy - edgeSize / 2, edgeSize, edgeSize);
      });

      // Draw rule of thirds guides
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      // Vertical lines
      ctx.beginPath();
      ctx.moveTo(x + w / 3, y);
      ctx.lineTo(x + w / 3, y + h);
      ctx.moveTo(x + (2 * w) / 3, y);
      ctx.lineTo(x + (2 * w) / 3, y + h);
      // Horizontal lines
      ctx.moveTo(x, y + h / 3);
      ctx.lineTo(x + w, y + h / 3);
      ctx.moveTo(x, y + (2 * h) / 3);
      ctx.lineTo(x + w, y + (2 * h) / 3);
      ctx.stroke();
    }

    // Draw perspective quadrilateral overlay
    if (isPerspective && perspectiveCorners) {
      const c = perspectiveCorners;

      // Darken outside the quad: fill canvas with semi-transparent black,
      // then "punch out" the quad by re-drawing it from the source canvas.
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(canvas.width, 0);
      ctx.lineTo(canvas.width, canvas.height);
      ctx.lineTo(0, canvas.height);
      ctx.closePath();
      // Counter-clockwise quad → even-odd fill clears its interior
      ctx.moveTo(c[0].x, c[0].y);
      ctx.lineTo(c[3].x, c[3].y);
      ctx.lineTo(c[2].x, c[2].y);
      ctx.lineTo(c[1].x, c[1].y);
      ctx.closePath();
      ctx.fill('evenodd');
      ctx.restore();

      // Quad outline
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(c[0].x, c[0].y);
      ctx.lineTo(c[1].x, c[1].y);
      ctx.lineTo(c[2].x, c[2].y);
      ctx.lineTo(c[3].x, c[3].y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // Numbered corner handles (1=TL, 2=TR, 3=BR, 4=BL)
      const handleR = HANDLE_SIZE;
      c.forEach((pt, i) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, handleR, 0, Math.PI * 2);
        ctx.fillStyle = i === activePerspectiveCorner ? '#d4a574' : '#fff';
        ctx.fill();
        ctx.strokeStyle = '#d4a574';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#3b2a14';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), pt.x, pt.y);
      });
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    // Magic background live preview (non-destructive): applied after draw, before mask overlay.
    // Skipped while cropping/blurring/healing to avoid interfering with those overlays.
    if (isMagicOpen && !isCropping && !isBlurring && !isHealing && canvas.width > 0 && canvas.height > 0) {
      try {
        const previewData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        transformMagicBackground(previewData, { intensity: magicIntensity, shadowRemoval });
        ctx.putImageData(previewData, 0, 0);
      } catch (err) {
        // getImageData can throw on tainted canvases; silently skip preview
      }
    }

    // Draw healing mask overlay
    if (isHealing && maskCanvasRef.current) {
      ctx.globalAlpha = 0.4;
      ctx.drawImage(maskCanvasRef.current, 0, 0);
      ctx.globalAlpha = 1.0;
    }
  }, [displaySize, rotation, flipH, flipV, imageLoaded, isCropping, cropStart, cropEnd, blurRegions, currentBlurRegion, blurIntensity, selectedBlurIndex, isBlurring, isHealing, hasMask, isMagicOpen, magicIntensity, shadowRemoval, transformMagicBackground, isPerspective, perspectiveCorners, activePerspectiveCorner]);

  useEffect(() => {
    drawImage();
  }, [drawImage]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Rotation handlers
  const rotateLeft = () => {
    pushUndo();
    setRotation((prev) => (prev - 90 + 360) % 360);
    setCropStart(null);
    setCropEnd(null);
    setBlurRegions([]);
    if (maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      setHasMask(false);
    }
  };

  const rotateRight = () => {
    pushUndo();
    setRotation((prev) => (prev + 90) % 360);
    setCropStart(null);
    setCropEnd(null);
    setBlurRegions([]);
    if (maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      setHasMask(false);
    }
  };

  // Flip handlers
  const flipHorizontal = () => {
    pushUndo();
    setFlipH(prev => !prev);
    setCropStart(null);
    setCropEnd(null);
    setBlurRegions([]);
    clearMaskCanvas();
  };

  const flipVertical = () => {
    pushUndo();
    setFlipV(prev => !prev);
    setCropStart(null);
    setCropEnd(null);
    setBlurRegions([]);
    clearMaskCanvas();
  };

  // Toggle crop mode
  const toggleCropMode = () => {
    if (isCropping) {
      setCropStart(null);
      setCropEnd(null);
    }
    setIsCropping(!isCropping);
    setIsBlurring(false);
    setIsHealing(false);
    setIsPerspective(false);
    setPerspectiveCorners(null);
  };

  // Toggle blur mode
  const toggleBlurMode = () => {
    setIsBlurring(!isBlurring);
    setIsCropping(false);
    setCropStart(null);
    setCropEnd(null);
    setSelectedBlurIndex(-1);
    setIsHealing(false);
    setIsPerspective(false);
    setPerspectiveCorners(null);
  };

  // Toggle healing mode
  const toggleHealMode = () => {
    const entering = !isHealing;
    setIsHealing(entering);
    setIsCropping(false);
    setIsBlurring(false);
    setIsPerspective(false);
    setCropStart(null);
    setCropEnd(null);
    setSelectedBlurIndex(-1);
    if (entering) {
      // Initialize mask canvas
      initMaskCanvas();
    }
  };

  // Toggle perspective-correction mode. Initializes the 4 corners to a
  // centered rectangle inset by ~15 % so the user can grab them and pull
  // them to the actual paper corners.
  const togglePerspectiveMode = () => {
    const entering = !isPerspective;
    setIsCropping(false);
    setIsBlurring(false);
    setIsHealing(false);
    setCropStart(null);
    setCropEnd(null);
    setSelectedBlurIndex(-1);
    setIsPerspective(entering);
    if (entering) {
      const w = displaySize.width;
      const h = displaySize.height;
      const ix = w * 0.15;
      const iy = h * 0.15;
      setPerspectiveCorners([
        { x: ix,         y: iy },           // TL
        { x: w - ix,     y: iy },           // TR
        { x: w - ix,     y: h - iy },       // BR
        { x: ix,         y: h - iy },       // BL
      ]);
    } else {
      setPerspectiveCorners(null);
    }
    setActivePerspectiveCorner(-1);
  };

  // Initialize or reset mask canvas
  const initMaskCanvas = () => {
    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement('canvas');
    }
    maskCanvasRef.current.width = displaySize.width;
    maskCanvasRef.current.height = displaySize.height;
    const ctx = maskCanvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, displaySize.width, displaySize.height);
    setHasMask(false);
  };

  // Clear the mask
  const clearMask = () => {
    if (maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      setHasMask(false);
      drawImage();
    }
  };

  // Paint on the mask canvas at position
  const paintMaskAt = (x, y) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d');
    const radius = healBrushSize / 2;

    if (isErasingMask) {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255, 0, 0, 1)';
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (!isErasingMask) setHasMask(true);
  };

  // Paint a line on the mask (Bresenham interpolation to avoid gaps)
  const paintMaskLine = (from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / (healBrushSize / 4)));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      paintMaskAt(x, y);
    }
  };

  // Apply healing / inpainting
  const applyHeal = async () => {
    if (!maskCanvasRef.current || !imageRef.current) return;

    setIsProcessingHeal(true);

    try {
      // Use setTimeout to let the UI update with the processing state
      await new Promise(resolve => setTimeout(resolve, 50));

      const img = imageRef.current;

      // Create a full-resolution canvas with the current image (with rotation applied)
      let srcWidth = img.width;
      let srcHeight = img.height;
      if (rotation % 180 !== 0) {
        [srcWidth, srcHeight] = [srcHeight, srcWidth];
      }

      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = srcWidth;
      fullCanvas.height = srcHeight;
      const fullCtx = fullCanvas.getContext('2d');

      // Apply rotation and flip
      fullCtx.translate(srcWidth / 2, srcHeight / 2);
      fullCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      fullCtx.rotate((rotation * Math.PI) / 180);
      fullCtx.drawImage(img, -img.width / 2, -img.height / 2);
      fullCtx.setTransform(1, 0, 0, 1, 0, 0);

      // Scale mask to full resolution
      const scaleX = srcWidth / displaySize.width;
      const scaleY = srcHeight / displaySize.height;

      const fullMaskCanvas = document.createElement('canvas');
      fullMaskCanvas.width = srcWidth;
      fullMaskCanvas.height = srcHeight;
      const fullMaskCtx = fullMaskCanvas.getContext('2d');
      fullMaskCtx.drawImage(maskCanvasRef.current, 0, 0, srcWidth, srcHeight);

      // Extract mask as Uint8Array
      const maskImageData = fullMaskCtx.getImageData(0, 0, srcWidth, srcHeight);
      const maskArray = new Uint8Array(srcWidth * srcHeight);
      for (let i = 0; i < maskArray.length; i++) {
        // Red channel > 128 means masked
        maskArray[i] = maskImageData.data[i * 4] > 128 ? 1 : 0;
      }

      // Check if there are any masked pixels
      let hasMaskedPixels = false;
      for (let i = 0; i < maskArray.length; i++) {
        if (maskArray[i] === 1) { hasMaskedPixels = true; break; }
      }
      if (!hasMaskedPixels) {
        setIsProcessingHeal(false);
        return;
      }

      // Get image data
      const imageData = fullCtx.getImageData(0, 0, srcWidth, srcHeight);

      // Auto-calculate heal radius from brush size
      const autoHealRadius = Math.max(5, Math.ceil(healBrushSize / 3));
      const scaledRadius = Math.round(autoHealRadius * Math.max(scaleX, scaleY));

      // Run inpainting
      const result = inpaint(imageData, maskArray, scaledRadius);

      // Put result back
      fullCtx.putImageData(result, 0, 0);

      // Convert to new image
      const dataUrl = fullCanvas.toDataURL('image/jpeg', 0.95);
      const newImg = new Image();
      await new Promise((resolve, reject) => {
        newImg.onload = resolve;
        newImg.onerror = reject;
        newImg.src = dataUrl;
      });

      // Update image ref (reset rotation/flip since we baked them in)
      imageRef.current = newImg;
      setOriginalSize({ width: newImg.width, height: newImg.height });
      setRotation(0);
      setFlipH(false);
      setFlipV(false);

      // Clear mask
      clearMask();
      setHasMask(false);
    } catch (error) {
      console.error('Healing failed:', error);
      addToast('Healing failed: ' + error.message, 'error');
    } finally {
      setIsProcessingHeal(false);
    }
  };

  // Get mouse/touch position relative to canvas
  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // Support touch events: use first touch point if available
    const clientX = e.touches ? e.touches[0].clientX : (e.changedTouches ? e.changedTouches[0].clientX : e.clientX);
    const clientY = e.touches ? e.touches[0].clientY : (e.changedTouches ? e.changedTouches[0].clientY : e.clientY);
    // Account for canvas CSS scaling vs actual canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Clamp position to canvas bounds
  const clampToCanvas = (pos) => {
    return {
      x: Math.max(0, Math.min(displaySize.width, pos.x)),
      y: Math.max(0, Math.min(displaySize.height, pos.y)),
    };
  };

  // Get normalized region bounds
  const getNormalizedRegion = (region) => {
    return {
      x: Math.min(region.x, region.x + region.w),
      y: Math.min(region.y, region.y + region.h),
      w: Math.abs(region.w),
      h: Math.abs(region.h),
      shape: region.shape || 'rect',
    };
  };

  // Check if point is near a blur region handle
  const getBlurHandleAtPoint = (pos, regionIndex) => {
    if (regionIndex < 0 || regionIndex >= blurRegions.length) return null;

    const region = getNormalizedRegion(blurRegions[regionIndex]);
    const { x, y, w, h } = region;

    // Check corner handles
    if (isNearPoint(pos, x, y)) return 'nw';
    if (isNearPoint(pos, x + w, y)) return 'ne';
    if (isNearPoint(pos, x, y + h)) return 'sw';
    if (isNearPoint(pos, x + w, y + h)) return 'se';

    // Check edge handles
    if (isNearPoint(pos, x + w / 2, y, EDGE_THRESHOLD)) return 'n';
    if (isNearPoint(pos, x + w / 2, y + h, EDGE_THRESHOLD)) return 's';
    if (isNearPoint(pos, x, y + h / 2, EDGE_THRESHOLD)) return 'w';
    if (isNearPoint(pos, x + w, y + h / 2, EDGE_THRESHOLD)) return 'e';

    // Check if inside for move
    if (region.shape === 'circle') {
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      const radiusX = w / 2;
      const radiusY = h / 2;
      const dx = (pos.x - centerX) / radiusX;
      const dy = (pos.y - centerY) / radiusY;
      if (dx * dx + dy * dy <= 1) return 'move';
    } else {
      if (pos.x > x && pos.x < x + w && pos.y > y && pos.y < y + h) return 'move';
    }

    return null;
  };

  // Check if point is inside a blur region (returns index)
  const getBlurRegionAtPoint = (pos) => {
    for (let i = blurRegions.length - 1; i >= 0; i--) {
      const region = getNormalizedRegion(blurRegions[i]);
      const { x, y, w, h, shape } = region;

      if (shape === 'circle') {
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const radiusX = w / 2;
        const radiusY = h / 2;
        const dx = (pos.x - centerX) / radiusX;
        const dy = (pos.y - centerY) / radiusY;
        if (dx * dx + dy * dy <= 1) return i;
      } else {
        if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) return i;
      }
    }
    return -1;
  };

  // Resize blur region based on handle
  const resizeBlurRegion = (pos, handle, index) => {
    const region = getNormalizedRegion(blurRegions[index]);
    let { x, y, w, h } = region;
    const clampedPos = clampToCanvas(pos);

    switch (handle) {
      case 'nw':
        w = (x + w) - clampedPos.x;
        h = (y + h) - clampedPos.y;
        x = clampedPos.x;
        y = clampedPos.y;
        break;
      case 'ne':
        w = clampedPos.x - x;
        h = (y + h) - clampedPos.y;
        y = clampedPos.y;
        break;
      case 'sw':
        w = (x + w) - clampedPos.x;
        h = clampedPos.y - y;
        x = clampedPos.x;
        break;
      case 'se':
        w = clampedPos.x - x;
        h = clampedPos.y - y;
        break;
      case 'n':
        h = (y + h) - clampedPos.y;
        y = clampedPos.y;
        break;
      case 's':
        h = clampedPos.y - y;
        break;
      case 'w':
        w = (x + w) - clampedPos.x;
        x = clampedPos.x;
        break;
      case 'e':
        w = clampedPos.x - x;
        break;
      case 'move':
        const dx = pos.x - blurDragStart.x;
        const dy = pos.y - blurDragStart.y;
        x = region.x + dx;
        y = region.y + dy;

        // Keep within bounds
        if (x < 0) x = 0;
        if (y < 0) y = 0;
        if (x + w > displaySize.width) x = displaySize.width - w;
        if (y + h > displaySize.height) y = displaySize.height - h;

        setBlurDragStart(pos);
        break;
    }

    // Ensure minimum size
    if (w < 20) w = 20;
    if (h < 20) h = 20;

    setBlurRegions(prev => prev.map((r, i) =>
      i === index ? { x, y, w, h, shape: region.shape } : r
    ));
  };

  // Find which perspective corner index is under a position, or -1
  const getPerspectiveCornerAt = (pos) => {
    if (!perspectiveCorners) return -1;
    const radius = HANDLE_SIZE * 1.6; // forgiving touch target
    for (let i = 0; i < perspectiveCorners.length; i++) {
      const dx = pos.x - perspectiveCorners[i].x;
      const dy = pos.y - perspectiveCorners[i].y;
      if (dx * dx + dy * dy <= radius * radius) return i;
    }
    return -1;
  };

  // Mouse down handler
  const handleMouseDown = (e) => {
    const pos = getMousePos(e);

    if (isPerspective) {
      const idx = getPerspectiveCornerAt(pos);
      if (idx >= 0) {
        setActivePerspectiveCorner(idx);
        setIsDragging(true);
      }
      return;
    }

    if (isHealing) {
      isPaintingMask.current = true;
      // Check for Alt key for eraser mode
      const erasing = e.altKey;
      setIsErasingMask(erasing);
      wasErasingRef.current = erasing;
      paintMaskAt(pos.x, pos.y);
      lastMaskPos.current = pos;
      drawImage();
      return;
    }

    if (isBlurring) {
      // First check if clicking on a selected region's handle
      if (selectedBlurIndex >= 0) {
        const handle = getBlurHandleAtPoint(pos, selectedBlurIndex);
        if (handle) {
          setBlurHandle(handle);
          setBlurDragStart(pos);
          setIsDragging(true);
          return;
        }
      }

      // Check if clicking on any blur region to select it
      const regionIndex = getBlurRegionAtPoint(pos);
      if (regionIndex >= 0) {
        setSelectedBlurIndex(regionIndex);
        const handle = getBlurHandleAtPoint(pos, regionIndex);
        if (handle) {
          setBlurHandle(handle);
          setBlurDragStart(pos);
          setIsDragging(true);
        }
        return;
      }

      // Deselect and start drawing new region
      setSelectedBlurIndex(-1);
      setCurrentBlurRegion({ x: pos.x, y: pos.y, w: 0, h: 0, shape: blurShape });
      setIsDragging(true);
      return;
    }

    if (!isCropping) return;

    // Check if clicking on existing crop handles
    const handle = getHandleAtPosition(pos);

    if (handle) {
      setActiveHandle(handle);
      setIsDragging(true);
      setDragStart(pos);
    } else {
      // Start new crop selection
      setCropStart(pos);
      setCropEnd(pos);
      setActiveHandle(null);
      setIsDragging(true);
    }
  };

  // Mouse move handler
  const handleMouseMove = (e) => {
    const pos = getMousePos(e);
    const canvas = canvasRef.current;

    if (isPerspective) {
      if (isDragging && activePerspectiveCorner >= 0) {
        const clamped = clampToCanvas(pos);
        setPerspectiveCorners((prev) => {
          if (!prev) return prev;
          const next = prev.slice();
          next[activePerspectiveCorner] = clamped;
          return next;
        });
        canvas.style.cursor = 'grabbing';
      } else {
        canvas.style.cursor = getPerspectiveCornerAt(pos) >= 0 ? 'grab' : 'crosshair';
      }
      return;
    }

    if (isHealing) {
      canvas.style.cursor = isErasingMask ? 'cell' : 'crosshair';
      if (isPaintingMask.current && lastMaskPos.current) {
        paintMaskLine(lastMaskPos.current, pos);
        lastMaskPos.current = pos;
        drawImage();
      }
      return;
    }

    if (isBlurring) {
      // If dragging a blur handle, resize/move the region
      if (isDragging && blurHandle && selectedBlurIndex >= 0) {
        resizeBlurRegion(pos, blurHandle, selectedBlurIndex);
        canvas.style.cursor = getCursorForHandle(blurHandle);
        return;
      }

      // If drawing a new region
      if (isDragging && currentBlurRegion) {
        setCurrentBlurRegion((prev) => ({
          ...prev,
          w: pos.x - prev.x,
          h: pos.y - prev.y,
        }));
        canvas.style.cursor = 'crosshair';
        return;
      }

      // Update cursor based on hover
      if (selectedBlurIndex >= 0) {
        const handle = getBlurHandleAtPoint(pos, selectedBlurIndex);
        if (handle) {
          canvas.style.cursor = getCursorForHandle(handle);
          return;
        }
      }

      // Check if hovering over any blur region
      const hoverIndex = getBlurRegionAtPoint(pos);
      if (hoverIndex >= 0) {
        canvas.style.cursor = 'pointer';
      } else {
        canvas.style.cursor = 'crosshair';
      }
      return;
    }

    if (!isCropping) {
      canvas.style.cursor = 'default';
      return;
    }

    // Update cursor based on handle hover
    if (!isDragging) {
      const handle = getHandleAtPosition(pos);
      canvas.style.cursor = getCursorForHandle(handle);
      return;
    }

    if (activeHandle) {
      // Resize or move existing selection
      resizeCrop(pos, activeHandle);
    } else {
      // Drawing new selection
      setCropEnd(clampToCanvas(pos));
    }
  };

  // Resize crop based on handle being dragged
  const resizeCrop = (pos, handle) => {
    const x1 = Math.min(cropStart.x, cropEnd.x);
    const y1 = Math.min(cropStart.y, cropEnd.y);
    const x2 = Math.max(cropStart.x, cropEnd.x);
    const y2 = Math.max(cropStart.y, cropEnd.y);

    let newStart = { x: x1, y: y1 };
    let newEnd = { x: x2, y: y2 };

    const clampedPos = clampToCanvas(pos);

    switch (handle) {
      case 'nw':
        newStart = { x: clampedPos.x, y: clampedPos.y };
        break;
      case 'ne':
        newStart = { x: x1, y: clampedPos.y };
        newEnd = { x: clampedPos.x, y: y2 };
        break;
      case 'sw':
        newStart = { x: clampedPos.x, y: y1 };
        newEnd = { x: x2, y: clampedPos.y };
        break;
      case 'se':
        newEnd = { x: clampedPos.x, y: clampedPos.y };
        break;
      case 'n':
        newStart = { x: x1, y: clampedPos.y };
        break;
      case 's':
        newEnd = { x: x2, y: clampedPos.y };
        break;
      case 'w':
        newStart = { x: clampedPos.x, y: y1 };
        break;
      case 'e':
        newEnd = { x: clampedPos.x, y: y2 };
        break;
      case 'move':
        const dx = pos.x - dragStart.x;
        const dy = pos.y - dragStart.y;
        const w = x2 - x1;
        const h = y2 - y1;

        let newX1 = x1 + dx;
        let newY1 = y1 + dy;

        // Keep within bounds
        if (newX1 < 0) newX1 = 0;
        if (newY1 < 0) newY1 = 0;
        if (newX1 + w > displaySize.width) newX1 = displaySize.width - w;
        if (newY1 + h > displaySize.height) newY1 = displaySize.height - h;

        newStart = { x: newX1, y: newY1 };
        newEnd = { x: newX1 + w, y: newY1 + h };
        setDragStart(pos);
        break;
    }

    setCropStart(newStart);
    setCropEnd(newEnd);
  };

  // Mouse up handler
  const handleMouseUp = async () => {
    if (isPerspective) {
      setIsDragging(false);
      setActivePerspectiveCorner(-1);
      return;
    }

    if (isHealing) {
      isPaintingMask.current = false;
      lastMaskPos.current = null;
      const wasErasing = wasErasingRef.current;
      setIsErasingMask(false);
      wasErasingRef.current = false;

      // Auto-apply heal on mouse up if mask was painted (not erased)
      if (hasMask && !wasErasing && !isProcessingHeal) {
        pushUndo();
        await applyHeal();
      }
      return;
    }

    if (isBlurring) {
      // If we were resizing/moving a blur region
      if (blurHandle) {
        setBlurHandle(null);
        setBlurDragStart(null);
        setIsDragging(false);
        return;
      }

      // If we were drawing a new region
      if (currentBlurRegion) {
        const rw = Math.abs(currentBlurRegion.w);
        const rh = Math.abs(currentBlurRegion.h);
        if (rw > 10 && rh > 10) {
          const normalized = {
            x: currentBlurRegion.w < 0 ? currentBlurRegion.x + currentBlurRegion.w : currentBlurRegion.x,
            y: currentBlurRegion.h < 0 ? currentBlurRegion.y + currentBlurRegion.h : currentBlurRegion.y,
            w: rw,
            h: rh,
            shape: currentBlurRegion.shape || blurShape,
          };
          setBlurRegions((prev) => [...prev, normalized]);
          setSelectedBlurIndex(blurRegions.length); // Select the newly created region
        }
        setCurrentBlurRegion(null);
      }
    }

    setIsDragging(false);
    setActiveHandle(null);
  };

  // Touch event handlers for mobile support
  const handleTouchStart = (e) => {
    if (isCropping || isBlurring || isHealing || isPerspective) {
      e.preventDefault();
    }
    handleMouseDown(e);
  };

  const handleTouchMove = (e) => {
    if (isCropping || isBlurring || isHealing || isPerspective) {
      e.preventDefault();
    }
    handleMouseMove(e);
  };

  const handleTouchEnd = (e) => {
    if (isCropping || isBlurring || isHealing || isPerspective) {
      e.preventDefault();
    }
    handleMouseUp();
  };

  // Double-click handler to remove blur regions
  const handleDoubleClick = (e) => {
    if (!isBlurring && blurRegions.length === 0) return;

    const pos = getMousePos(e);
    const regionIndex = getBlurRegionAtPoint(pos);

    if (regionIndex >= 0) {
      setBlurRegions((prev) => prev.filter((_, i) => i !== regionIndex));
    }
  };

  // Apply crop to get the final image
  const applyCrop = () => {
    if (!cropStart || !cropEnd) return;

    pushUndo();
    const img = imageRef.current;

    // Calculate crop in original image coordinates
    let srcWidth = img.width;
    let srcHeight = img.height;
    if (rotation % 180 !== 0) {
      [srcWidth, srcHeight] = [srcHeight, srcWidth];
    }

    const scale = srcWidth / displaySize.width;

    const cropX = Math.min(cropStart.x, cropEnd.x) * scale;
    const cropY = Math.min(cropStart.y, cropEnd.y) * scale;
    const cropW = Math.abs(cropEnd.x - cropStart.x) * scale;
    const cropH = Math.abs(cropEnd.y - cropStart.y) * scale;

    // Create a temporary canvas for the rotated image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = srcWidth;
    tempCanvas.height = srcHeight;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.translate(srcWidth / 2, srcHeight / 2);
    tempCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    tempCtx.rotate((rotation * Math.PI) / 180);
    tempCtx.drawImage(img, -img.width / 2, -img.height / 2);

    // Create final canvas with cropped dimensions
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = cropW;
    finalCanvas.height = cropH;
    const finalCtx = finalCanvas.getContext('2d');

    finalCtx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Update the image reference
    const croppedImg = new Image();
    croppedImg.onload = () => {
      imageRef.current = croppedImg;
      setOriginalSize({ width: croppedImg.width, height: croppedImg.height });
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setCropStart(null);
      setCropEnd(null);
      setIsCropping(false);
      // Scale blur regions to new image
      setBlurRegions([]);
    };
    croppedImg.src = finalCanvas.toDataURL('image/jpeg', 0.92);
  };

  // ---------- Perspective correction ----------
  //
  // Solve the 3×3 homography H that maps the four source quadrilateral
  // corners (the paper as it appears in the photo) to the four corners
  // of an axis-aligned rectangle (the "scanned" output).
  //
  // We then warp by walking every output pixel and inverse-mapping it
  // through H to sample the source with bilinear interpolation.

  // Solve an 8×8 linear system for the 8 homography parameters
  // (h33 fixed at 1). Standard direct linear transform.
  const solveHomography = (src, dst) => {
    // src, dst are arrays of 4 {x,y} points. Returns 9-element row-major H or null.
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const { x: sx, y: sy } = src[i];
      const { x: dx, y: dy } = dst[i];
      A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
      b.push(dx);
      A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
      b.push(dy);
    }
    // Gauss–Jordan elimination on the 8×9 augmented matrix
    for (let i = 0; i < 8; i++) A[i].push(b[i]);
    for (let col = 0; col < 8; col++) {
      // Pivot: pick the row with largest |A[r][col]|
      let pivot = col;
      for (let r = col + 1; r < 8; r++) {
        if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
      }
      if (Math.abs(A[pivot][col]) < 1e-10) return null; // singular
      if (pivot !== col) [A[col], A[pivot]] = [A[pivot], A[col]];
      // Normalize pivot row
      const pv = A[col][col];
      for (let c = col; c <= 8; c++) A[col][c] /= pv;
      // Eliminate other rows
      for (let r = 0; r < 8; r++) {
        if (r === col) continue;
        const factor = A[r][col];
        if (factor === 0) continue;
        for (let c = col; c <= 8; c++) A[r][c] -= factor * A[col][c];
      }
    }
    return [A[0][8], A[1][8], A[2][8], A[3][8], A[4][8], A[5][8], A[6][8], A[7][8], 1];
  };

  // Apply 3×3 homography H to point (x,y) → (x', y')
  const applyHomography = (H, x, y) => {
    const w = H[6] * x + H[7] * y + H[8];
    if (w === 0) return { x: 0, y: 0 };
    return {
      x: (H[0] * x + H[1] * y + H[2]) / w,
      y: (H[3] * x + H[4] * y + H[5]) / w,
    };
  };

  const applyPerspective = () => {
    if (!perspectiveCorners) return;
    const img = imageRef.current;
    if (!img) return;

    pushUndo();

    // 1) Bake any current rotation/flip into a source canvas so the corner
    //    coordinates the user picked match the pixels we're sampling.
    let srcWidth = img.width;
    let srcHeight = img.height;
    if (rotation % 180 !== 0) {
      [srcWidth, srcHeight] = [srcHeight, srcWidth];
    }
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcWidth;
    srcCanvas.height = srcHeight;
    const sctx = srcCanvas.getContext('2d');
    sctx.translate(srcWidth / 2, srcHeight / 2);
    sctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    sctx.rotate((rotation * Math.PI) / 180);
    sctx.drawImage(img, -img.width / 2, -img.height / 2);
    sctx.setTransform(1, 0, 0, 1, 0, 0);

    // 2) Convert display-space corners to source-image space.
    const scale = srcWidth / displaySize.width;
    const srcQuad = perspectiveCorners.map((c) => ({ x: c.x * scale, y: c.y * scale }));

    // 3) Choose output dims = average of opposite-side lengths (roughly the
    //    real paper dimensions, in source-image pixels).
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const outW = Math.max(50, Math.round((dist(srcQuad[0], srcQuad[1]) + dist(srcQuad[3], srcQuad[2])) / 2));
    const outH = Math.max(50, Math.round((dist(srcQuad[0], srcQuad[3]) + dist(srcQuad[1], srcQuad[2])) / 2));
    const dstQuad = [
      { x: 0,    y: 0    },
      { x: outW, y: 0    },
      { x: outW, y: outH },
      { x: 0,    y: outH },
    ];

    // 4) Solve forward homography src→dst, then INVERT it for the warp loop.
    //    (We walk dst pixels and look up src; that's stable and produces a
    //    fully-filled output image.)
    const Hfwd = solveHomography(srcQuad, dstQuad);
    if (!Hfwd) {
      addToast?.('Quadrilatère dégénéré — déplace les coins', 'error');
      return;
    }
    const Hinv = solveHomography(dstQuad, srcQuad);
    if (!Hinv) {
      addToast?.('Quadrilatère dégénéré — déplace les coins', 'error');
      return;
    }

    // 5) Read source pixels once for sampling.
    const srcData = sctx.getImageData(0, 0, srcWidth, srcHeight).data;

    // 6) Build the output image, sampling with bilinear interpolation.
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const octx = outCanvas.getContext('2d');
    const outImageData = octx.createImageData(outW, outH);
    const outData = outImageData.data;

    const sample = (sx, sy) => {
      // Outside source → transparent (will become black on JPEG)
      if (sx < 0 || sx >= srcWidth - 1 || sy < 0 || sy >= srcHeight - 1) {
        return [0, 0, 0, 255];
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * srcWidth + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + srcWidth * 4;
      const i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      return [
        srcData[i00]     * w00 + srcData[i10]     * w10 + srcData[i01]     * w01 + srcData[i11]     * w11,
        srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11,
        srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11,
        255,
      ];
    };

    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const sp = applyHomography(Hinv, x, y);
        const [r, g, b, a] = sample(sp.x, sp.y);
        const oi = (y * outW + x) * 4;
        outData[oi]     = r;
        outData[oi + 1] = g;
        outData[oi + 2] = b;
        outData[oi + 3] = a;
      }
    }
    octx.putImageData(outImageData, 0, 0);

    // 7) Replace imageRef with the warped result and reset transform state.
    const warpedImg = new Image();
    warpedImg.onload = () => {
      imageRef.current = warpedImg;
      setOriginalSize({ width: warpedImg.width, height: warpedImg.height });
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setBlurRegions([]);
      setIsPerspective(false);
      setPerspectiveCorners(null);
      setActivePerspectiveCorner(-1);
    };
    warpedImg.src = outCanvas.toDataURL('image/jpeg', 0.92);
  };

  // Remove a specific blur region
  const removeBlurRegion = (index) => {
    setBlurRegions((prev) => prev.filter((_, i) => i !== index));
    if (selectedBlurIndex === index) {
      setSelectedBlurIndex(-1);
    } else if (selectedBlurIndex > index) {
      setSelectedBlurIndex(selectedBlurIndex - 1);
    }
  };

  // Clear all blur regions
  const clearBlurRegions = () => {
    setBlurRegions([]);
    setSelectedBlurIndex(-1);
  };

  // Apply box blur to a region
  const applyBoxBlur = (imageData, radius) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // Create a copy for reading
    const copy = new Uint8ClampedArray(data);

    // Multiple passes for smoother blur
    for (let pass = 0; pass < 3; pass++) {
      // Horizontal pass
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let r = 0, g = 0, b = 0, count = 0;

          for (let dx = -radius; dx <= radius; dx++) {
            const sx = Math.max(0, Math.min(width - 1, x + dx));
            const idx = (y * width + sx) * 4;
            r += copy[idx];
            g += copy[idx + 1];
            b += copy[idx + 2];
            count++;
          }

          const idx = (y * width + x) * 4;
          data[idx] = r / count;
          data[idx + 1] = g / count;
          data[idx + 2] = b / count;
        }
      }

      // Copy result for vertical pass
      copy.set(data);

      // Vertical pass
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let r = 0, g = 0, b = 0, count = 0;

          for (let dy = -radius; dy <= radius; dy++) {
            const sy = Math.max(0, Math.min(height - 1, y + dy));
            const idx = (sy * width + x) * 4;
            r += copy[idx];
            g += copy[idx + 1];
            b += copy[idx + 2];
            count++;
          }

          const idx = (y * width + x) * 4;
          data[idx] = r / count;
          data[idx + 1] = g / count;
          data[idx + 2] = b / count;
        }
      }

      copy.set(data);
    }

    return imageData;
  };

  // Apply blur regions to canvas
  const applyBlurToCanvas = (canvas, regions, scale) => {
    const ctx = canvas.getContext('2d');

    regions.forEach((region) => {
      const scaledRegion = {
        x: Math.round(region.x * scale),
        y: Math.round(region.y * scale),
        w: Math.round(region.w * scale),
        h: Math.round(region.h * scale),
        shape: region.shape || 'rect',
      };

      // Ensure region is within bounds
      const x = Math.max(0, scaledRegion.x);
      const y = Math.max(0, scaledRegion.y);
      const w = Math.min(scaledRegion.w, canvas.width - x);
      const h = Math.min(scaledRegion.h, canvas.height - y);

      if (w > 0 && h > 0) {
        const imageData = ctx.getImageData(x, y, w, h);
        const blurRadius = Math.round(blurIntensity * scale / displaySize.width * 100);
        const blurredData = applyBoxBlur(imageData, blurRadius);

        if (scaledRegion.shape === 'circle') {
          // For circle, create a temporary canvas and apply with clip
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = w;
          tempCanvas.height = h;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.putImageData(blurredData, 0, 0);

          // Apply with elliptical clip
          const centerX = x + w / 2;
          const centerY = y + h / 2;
          const radiusX = w / 2;
          const radiusY = h / 2;

          ctx.save();
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(tempCanvas, x, y);
          ctx.restore();
        } else {
          // Rectangle - direct put
          ctx.putImageData(blurredData, x, y);
        }
      }
    });
  };

  // Reset all edits
  // Final (destructive) magic background — mutates imageRef.current and pushes undo
  const applyMagicBackground = (intensity = 50, sFlat = 0) => {
    const img = imageRef.current;
    if (!img) return;

    pushUndo();

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.width;
    srcCanvas.height = img.height;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(img, 0, 0);

    const imageData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    transformMagicBackground(imageData, { intensity, shadowRemoval: sFlat });
    srcCtx.putImageData(imageData, 0, 0);

    const cleaned = new Image();
    cleaned.onload = () => {
      imageRef.current = cleaned;
      setOriginalSize({ width: cleaned.width, height: cleaned.height });
    };
    cleaned.src = srcCanvas.toDataURL('image/jpeg', 0.95);
  };

  const resetEdits = () => {
    if (!blobUrl) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setOriginalSize({ width: img.width, height: img.height });
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setCropStart(null);
      setCropEnd(null);
      setIsCropping(false);
      setIsBlurring(false);
      setBlurRegions([]);
      setIsHealing(false);
      if (maskCanvasRef.current) {
        const ctx = maskCanvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      }
      setHasMask(false);
      setUndoStack([]);
      setRedoStack([]);
    };
    img.src = blobUrl;
  };

  // Restore original image from server
  const doRestoreOriginal = async () => {
    setRestoringOriginal(true);
    try {
      await pictureService.restoreOriginal(pictureId);
      setHasOriginal(false);

      // Reload the image within the editor instead of full page reload
      const proxyUrl = `${API_URL}/api/pictures/${pictureId}/image-proxy`;
      const token = localStorage.getItem('token');
      const response = await fetch(proxyUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch restored image');

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setBlobUrl(objectUrl);

      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setOriginalSize({ width: img.width, height: img.height });
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        setCropStart(null);
        setCropEnd(null);
        setIsCropping(false);
        setIsBlurring(false);
        setBlurRegions([]);
        setIsHealing(false);
        if (maskCanvasRef.current) {
          const ctx = maskCanvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
        }
        setHasMask(false);
        setRestoringOriginal(false);
      };
      img.src = objectUrl;
    } catch (error) {
      console.error('Failed to restore original:', error);
      addToast('Failed to restore original image: ' + error.message, 'error');
      setRestoringOriginal(false);
    }
  };

  const handleRestoreOriginal = () => {
    if (!hasOriginal) return;
    setConfirmAction({
      title: 'Restore original?',
      message: 'Are you sure you want to restore the original image? This will undo all previous edits saved to the server.',
      confirmText: 'Restore',
      variant: 'warning',
      onConfirm: () => {
        setConfirmAction(null);
        doRestoreOriginal();
      },
    });
  };

  // Save the edited image
  const handleSave = async () => {
    if (!imageRef.current) return;

    setSaving(true);

    try {
      const img = imageRef.current;

      // Create final canvas with full resolution
      let finalWidth = img.width;
      let finalHeight = img.height;

      if (rotation % 180 !== 0) {
        [finalWidth, finalHeight] = [finalHeight, finalWidth];
      }

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = finalWidth;
      finalCanvas.height = finalHeight;
      const ctx = finalCanvas.getContext('2d');

      ctx.translate(finalWidth / 2, finalHeight / 2);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Apply blur regions at full resolution
      if (blurRegions.length > 0) {
        const scale = finalWidth / displaySize.width;
        applyBlurToCanvas(finalCanvas, blurRegions, scale);
      }

      // Convert to blob
      const blob = await new Promise((resolve) => {
        finalCanvas.toBlob(resolve, 'image/jpeg', 0.92);
      });

      await onSave(blob, pictureId);
    } catch (error) {
      console.error('Failed to save edited image:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="image-editor">
        <div className="image-editor__loading">
          <p className="image-editor__error">Error: {loadError}</p>
          <button className="image-editor__btn" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!imageLoaded) {
    return (
      <div className="image-editor">
        <div className="image-editor__loading">
          <div className="spinner"></div>
          <p>Loading image...</p>
        </div>
      </div>
    );
  }

  const hasCropSelection =
    cropStart &&
    cropEnd &&
    Math.abs(cropEnd.x - cropStart.x) > 10 &&
    Math.abs(cropEnd.y - cropStart.y) > 10;

  const hasChanges = rotation !== 0 || flipH || flipV || blurRegions.length > 0 || hasMask || undoStack.length > 0 || imageRef.current?.src !== blobUrl;

  return (
    <div className="image-editor">
      <div className="image-editor__toolbar">
        <div className="image-editor__toolbar-group">
          <button
            className="image-editor__btn"
            onClick={rotateLeft}
            title="Rotate left 90°"
          >
            ↺
          </button>
          <button
            className="image-editor__btn"
            onClick={rotateRight}
            title="Rotate right 90°"
          >
            ↻
          </button>
          <button
            className={`image-editor__btn ${flipH ? 'active' : ''}`}
            onClick={flipHorizontal}
            title="Flip horizontal"
          >
            ⇔
          </button>
          <button
            className={`image-editor__btn ${flipV ? 'active' : ''}`}
            onClick={flipVertical}
            title="Flip vertical"
          >
            ⇕
          </button>
        </div>

        <div className="image-editor__toolbar-divider" />

        <div className="image-editor__toolbar-group">
          <button
            className={`image-editor__btn ${isCropping ? 'active' : ''}`}
            onClick={toggleCropMode}
            title={isCropping ? 'Cancel crop' : 'Start cropping'}
          >
            Crop
          </button>
          {isCropping && hasCropSelection && (
            <button
              className="image-editor__btn image-editor__btn--primary"
              onClick={applyCrop}
              title="Apply crop"
            >
              Apply
            </button>
          )}
        </div>

        <div className="image-editor__toolbar-divider" />

        <div className="image-editor__toolbar-group">
          <button
            className={`image-editor__btn ${isPerspective ? 'active' : ''}`}
            onClick={togglePerspectiveMode}
            title={isPerspective ? 'Cancel perspective' : 'Perspective correction (4-corner straighten)'}
          >
            Perspective
          </button>
          {isPerspective && (
            <button
              className="image-editor__btn image-editor__btn--primary"
              onClick={applyPerspective}
              title="Straighten the selected quadrilateral into a rectangle"
            >
              Apply
            </button>
          )}
        </div>

        <div className="image-editor__toolbar-divider" />

        <div className="image-editor__toolbar-group">
          <button
            className={`image-editor__btn ${isBlurring ? 'active' : ''}`}
            onClick={toggleBlurMode}
            title={isBlurring ? 'Exit blur mode' : 'Add blur regions for privacy'}
          >
            Blur
          </button>
          {isBlurring && (
            <>
              <button
                className={`image-editor__btn ${blurShape === 'rect' ? 'active' : ''}`}
                onClick={() => setBlurShape('rect')}
                title="Rectangle blur shape"
              >
                ▭
              </button>
              <button
                className={`image-editor__btn ${blurShape === 'circle' ? 'active' : ''}`}
                onClick={() => setBlurShape('circle')}
                title="Circle/ellipse blur shape (good for faces)"
              >
                ○
              </button>
              <input
                type="range"
                min="5"
                max="30"
                value={blurIntensity}
                onChange={(e) => setBlurIntensity(Number(e.target.value))}
                className="blur-slider"
                title="Blur intensity"
              />
              <span className="blur-value">{blurIntensity}px</span>
            </>
          )}
          {blurRegions.length > 0 && (
            <>
              <span className="blur-count">{blurRegions.length}</span>
              <button
                className="image-editor__btn"
                onClick={clearBlurRegions}
                title="Clear all blur regions"
              >
                Clear
              </button>
            </>
          )}
        </div>

        <div className="image-editor__toolbar-divider" />

        <div className="image-editor__toolbar-group">
          <button
            className={`image-editor__btn ${isHealing ? 'active' : ''}`}
            onClick={toggleHealMode}
            title={isHealing ? 'Exit healing mode' : 'Healing brush to remove objects'}
          >
            Heal
          </button>
          {isHealing && (
            <>
              <input
                type="range"
                min="3"
                max="50"
                value={healBrushSize}
                onChange={(e) => setHealBrushSize(Number(e.target.value))}
                className="blur-slider"
                title="Brush size"
              />
              <span className="blur-value">{healBrushSize}px</span>
            </>
          )}
        </div>

        <div className="image-editor__toolbar-divider" />

        <div className="image-editor__toolbar-group">
          <button
            className="image-editor__btn"
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            className="image-editor__btn"
            onClick={redo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Y)"
          >
            Redo
          </button>
        </div>

        <div className="image-editor__toolbar-divider" />

        <div className="image-editor__toolbar-group">
          <button
            className={`image-editor__btn image-editor__btn--magic ${isMagicOpen ? 'active' : ''}`}
            onClick={() => setIsMagicOpen((v) => !v)}
            title="Blanchir le fond (effet scan) — aperçu en direct"
          >
            ✨ Fond Magique
          </button>
          {isMagicOpen && (
            <>
              <span className="magic-label" title="Blanchiment du papier">Blanc</span>
              <input
                type="range"
                min="0"
                max="100"
                value={magicIntensity}
                onChange={(e) => setMagicIntensity(Number(e.target.value))}
                className="magic-slider"
                title="Blanchir le fond — aperçu en direct"
                aria-label="Magic background intensity"
              />
              <span className="blur-value">{magicIntensity}%</span>

              <span className="magic-label" title="Atténue les ombres et l'éclairage inégal">Ombres</span>
              <input
                type="range"
                min="0"
                max="100"
                value={shadowRemoval}
                onChange={(e) => setShadowRemoval(Number(e.target.value))}
                className="magic-slider"
                title="Atténue les ombres / éclairage inégal — aperçu en direct"
                aria-label="Shadow removal intensity"
              />
              <span className="blur-value">{shadowRemoval}%</span>

              <button
                className="image-editor__btn image-editor__btn--magic"
                onClick={() => {
                  applyMagicBackground(magicIntensity, shadowRemoval);
                  setIsMagicOpen(false);
                }}
                title="Appliquer l'effet"
              >
                Apply
              </button>
              <button
                className="image-editor__btn"
                onClick={() => setIsMagicOpen(false)}
                title="Annuler l'aperçu"
              >
                ✕
              </button>
            </>
          )}
        </div>

        <div className="image-editor__toolbar-divider" />

        <div className="image-editor__toolbar-group">
          <button
            className="image-editor__btn"
            onClick={resetEdits}
            title="Reset all current edits"
          >
            Reset
          </button>
          {hasOriginal && (
            <button
              className="image-editor__btn image-editor__btn--restore"
              onClick={handleRestoreOriginal}
              disabled={restoringOriginal}
              title="Restore original uploaded image"
            >
              {restoringOriginal ? 'Restoring...' : 'Restore'}
            </button>
          )}
        </div>
      </div>

      {isCropping && (
        <div className="image-editor__help">
          Click and drag to select crop area. Drag corners/edges to resize, drag inside to move.
        </div>
      )}

      {isBlurring && (
        <div className="image-editor__help image-editor__help--blur">
          Draw {blurShape === 'circle' ? 'circular' : 'rectangular'} blur regions. Click to select, drag handles to resize, drag inside to move. Double-click to remove.
        </div>
      )}

      {isHealing && (
        <div className="image-editor__help image-editor__help--heal">
          Paint over the area to remove — healing applies automatically. Hold Alt to erase.
        </div>
      )}

      {blurRegions.length > 0 && !isBlurring && (
        <div className="image-editor__blur-list">
          <span>Blur regions (double-click on image to remove):</span>
          {blurRegions.map((region, index) => (
            <button
              key={index}
              className="blur-region-tag"
              onClick={() => removeBlurRegion(index)}
              title="Click to remove this blur region"
            >
              {region.shape === 'circle' ? '○' : '▭'} {index + 1} ×
            </button>
          ))}
        </div>
      )}

      <div className="image-editor__canvas-container" ref={containerRef} style={{ position: 'relative' }}>
        {isProcessingHeal && (
          <div className="image-editor__processing-overlay">
            <div className="spinner"></div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={`image-editor__canvas ${isCropping ? 'cropping' : ''} ${isBlurring ? 'blurring' : ''} ${isHealing ? 'healing' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
        />

        {/* Vertical zoom bar on the right edge of the canvas area */}
        <div className="image-editor__zoom-bar" aria-label="Zoom">
          <button
            type="button"
            className="image-editor__zoom-btn"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            title="Zoom +"
            disabled={zoom >= 3}
          >
            +
          </button>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="image-editor__zoom-slider"
            orient="vertical"
            aria-label="Canvas zoom"
          />
          <span className="image-editor__zoom-value">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="image-editor__zoom-btn"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
            title="Zoom −"
            disabled={zoom <= 1}
          >
            −
          </button>
          <button
            type="button"
            className="image-editor__zoom-btn image-editor__zoom-reset"
            onClick={() => setZoom(1)}
            title="Reset zoom"
            disabled={zoom === 1}
          >
            ↺
          </button>
        </div>
      </div>

      <div className="image-editor__actions">
        {saveError && (
          <div className="image-editor__save-error" role="alert">
            ⚠ {saveError}
          </div>
        )}
        <button
          className="image-editor__btn image-editor__btn--secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          className="image-editor__btn image-editor__btn--primary"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          title={!hasChanges ? 'No changes to save' : 'Save edited image'}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <ConfirmModal
        isOpen={!!confirmAction}
        onCancel={() => setConfirmAction(null)}
        {...confirmAction}
      />

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
};

export default ImageEditor;
