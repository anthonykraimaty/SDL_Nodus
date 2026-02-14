import { useState, useRef, useEffect, useCallback } from 'react';
import { pictureService } from '../services/api';
import { inpaint } from '../lib/inpaint';
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
const ImageEditor = ({ imageUrl, onSave, onCancel, pictureId }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  const [rotation, setRotation] = useState(0);
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

  // Healing brush state
  const [isHealing, setIsHealing] = useState(false);
  const [healBrushSize, setHealBrushSize] = useState(15);
  const [healRadius, setHealRadius] = useState(5);
  const [isProcessingHeal, setIsProcessingHeal] = useState(false);
  const [isErasingMask, setIsErasingMask] = useState(false);
  const maskCanvasRef = useRef(null);
  const isPaintingMask = useRef(false);
  const lastMaskPos = useRef(null);
  const [hasMask, setHasMask] = useState(false);

  // Original image restoration
  const [hasOriginal, setHasOriginal] = useState(false);
  const [restoringOriginal, setRestoringOriginal] = useState(false);

  // Image dimensions for display
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });

  const [loadError, setLoadError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);

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

  // Calculate display size based on container
  useEffect(() => {
    if (!imageLoaded || !containerRef.current) return;

    const container = containerRef.current;
    const maxWidth = container.clientWidth - 40;
    const maxHeight = window.innerHeight - 350;

    let { width, height } = originalSize;

    // Account for rotation
    if (rotation % 180 !== 0) {
      [width, height] = [height, width];
    }

    const scale = Math.min(maxWidth / width, maxHeight / height, 1);

    setDisplaySize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    });
  }, [imageLoaded, originalSize, rotation]);

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

  // Draw the image on canvas
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

    // Apply rotation
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
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

    // Draw healing mask overlay
    if (isHealing && maskCanvasRef.current) {
      ctx.globalAlpha = 0.4;
      ctx.drawImage(maskCanvasRef.current, 0, 0);
      ctx.globalAlpha = 1.0;
    }
  }, [displaySize, rotation, imageLoaded, isCropping, cropStart, cropEnd, blurRegions, currentBlurRegion, blurIntensity, selectedBlurIndex, isBlurring, isHealing, hasMask]);

  useEffect(() => {
    drawImage();
  }, [drawImage]);

  // Rotation handlers
  const rotateLeft = () => {
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

  // Toggle crop mode
  const toggleCropMode = () => {
    if (isCropping) {
      setCropStart(null);
      setCropEnd(null);
    }
    setIsCropping(!isCropping);
    setIsBlurring(false);
    setIsHealing(false);
  };

  // Toggle blur mode
  const toggleBlurMode = () => {
    setIsBlurring(!isBlurring);
    setIsCropping(false);
    setCropStart(null);
    setCropEnd(null);
    setSelectedBlurIndex(-1);
    setIsHealing(false);
  };

  // Toggle healing mode
  const toggleHealMode = () => {
    const entering = !isHealing;
    setIsHealing(entering);
    setIsCropping(false);
    setIsBlurring(false);
    setCropStart(null);
    setCropEnd(null);
    setSelectedBlurIndex(-1);
    if (entering) {
      // Initialize mask canvas
      initMaskCanvas();
    }
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

      // Apply rotation
      fullCtx.translate(srcWidth / 2, srcHeight / 2);
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

      // Scale heal radius proportionally
      const scaledRadius = Math.round(healRadius * Math.max(scaleX, scaleY));

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

      // Update image ref (reset rotation since we baked it in)
      imageRef.current = newImg;
      setOriginalSize({ width: newImg.width, height: newImg.height });
      setRotation(0);

      // Clear mask
      clearMask();
      setHasMask(false);
    } catch (error) {
      console.error('Healing failed:', error);
      alert('Healing failed: ' + error.message);
    } finally {
      setIsProcessingHeal(false);
    }
  };

  // Get mouse position relative to canvas
  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
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

  // Mouse down handler
  const handleMouseDown = (e) => {
    const pos = getMousePos(e);

    if (isHealing) {
      isPaintingMask.current = true;
      // Check for Alt key for eraser mode
      if (e.altKey) setIsErasingMask(true);
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
  const handleMouseUp = () => {
    if (isHealing) {
      isPaintingMask.current = false;
      lastMaskPos.current = null;
      setIsErasingMask(false);
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
      setCropStart(null);
      setCropEnd(null);
      setIsCropping(false);
      // Scale blur regions to new image
      setBlurRegions([]);
    };
    croppedImg.src = finalCanvas.toDataURL('image/jpeg', 0.92);
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
  const resetEdits = () => {
    if (!blobUrl) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setOriginalSize({ width: img.width, height: img.height });
      setRotation(0);
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
    };
    img.src = blobUrl;
  };

  // Restore original image from server
  const handleRestoreOriginal = async () => {
    if (!hasOriginal) return;

    const confirmed = window.confirm(
      'Are you sure you want to restore the original image? This will undo all previous edits saved to the server.'
    );

    if (!confirmed) return;

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
      alert('Failed to restore original image: ' + error.message);
      setRestoringOriginal(false);
    }
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

  const hasChanges = rotation !== 0 || blurRegions.length > 0 || hasMask || imageRef.current?.src !== blobUrl;

  return (
    <div className="image-editor">
      <div className="image-editor__toolbar">
        <div className="image-editor__toolbar-group">
          <span className="toolbar-label">Rotate</span>
          <button
            className="image-editor__btn"
            onClick={rotateLeft}
            title="Rotate left 90°"
          >
            ↺ Left
          </button>
          <button
            className="image-editor__btn"
            onClick={rotateRight}
            title="Rotate right 90°"
          >
            ↻ Right
          </button>
        </div>

        <div className="image-editor__toolbar-group">
          <span className="toolbar-label">Crop</span>
          <button
            className={`image-editor__btn ${isCropping ? 'active' : ''}`}
            onClick={toggleCropMode}
            title={isCropping ? 'Cancel crop' : 'Start cropping'}
          >
            {isCropping ? 'Cancel Crop' : 'Crop'}
          </button>
          {isCropping && hasCropSelection && (
            <button
              className="image-editor__btn image-editor__btn--primary"
              onClick={applyCrop}
              title="Apply crop"
            >
              Apply Crop
            </button>
          )}
        </div>

        <div className="image-editor__toolbar-group">
          <span className="toolbar-label">Blur</span>
          <button
            className={`image-editor__btn ${isBlurring ? 'active' : ''}`}
            onClick={toggleBlurMode}
            title={isBlurring ? 'Exit blur mode' : 'Add blur regions for privacy'}
          >
            {isBlurring ? 'Exit Blur' : 'Blur Tool'}
          </button>
          {blurRegions.length > 0 && (
            <>
              <span className="blur-count">{blurRegions.length} region(s)</span>
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

        {isBlurring && (
          <>
            <div className="image-editor__toolbar-group">
              <span className="toolbar-label">Shape</span>
              <button
                className={`image-editor__btn ${blurShape === 'rect' ? 'active' : ''}`}
                onClick={() => setBlurShape('rect')}
                title="Rectangle blur shape"
              >
                ▭ Rectangle
              </button>
              <button
                className={`image-editor__btn ${blurShape === 'circle' ? 'active' : ''}`}
                onClick={() => setBlurShape('circle')}
                title="Circle/ellipse blur shape (good for faces)"
              >
                ○ Circle
              </button>
            </div>

            <div className="image-editor__toolbar-group">
              <span className="toolbar-label">Intensity</span>
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
            </div>
          </>
        )}

        <div className="image-editor__toolbar-group">
          <span className="toolbar-label">Heal</span>
          <button
            className={`image-editor__btn ${isHealing ? 'active' : ''}`}
            onClick={toggleHealMode}
            title={isHealing ? 'Exit healing mode' : 'Healing brush to remove objects'}
          >
            {isHealing ? 'Exit Heal' : 'Healing Brush'}
          </button>
        </div>

        {isHealing && (
          <>
            <div className="image-editor__toolbar-group">
              <span className="toolbar-label">Brush</span>
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
            </div>

            <div className="image-editor__toolbar-group">
              <span className="toolbar-label">Radius</span>
              <input
                type="range"
                min="3"
                max="15"
                value={healRadius}
                onChange={(e) => setHealRadius(Number(e.target.value))}
                className="blur-slider"
                title="Search radius for surrounding texture"
              />
              <span className="blur-value">{healRadius}px</span>
            </div>

            <div className="image-editor__toolbar-group">
              <button
                className="image-editor__btn"
                onClick={clearMask}
                title="Clear the painted mask"
              >
                Clear Mask
              </button>
              <button
                className="image-editor__btn image-editor__btn--primary"
                onClick={applyHeal}
                disabled={isProcessingHeal || !hasMask}
                title={!hasMask ? 'Paint over the area to remove first' : 'Apply healing to remove painted areas'}
              >
                {isProcessingHeal ? 'Processing...' : 'Apply Heal'}
              </button>
            </div>
          </>
        )}

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
              {restoringOriginal ? 'Restoring...' : 'Restore Original'}
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
          Paint over the area to remove. Hold Alt to erase parts of the mask. Click "Apply Heal" when ready.
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
          onDoubleClick={handleDoubleClick}
        />
      </div>

      <div className="image-editor__actions">
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
    </div>
  );
};

export default ImageEditor;
