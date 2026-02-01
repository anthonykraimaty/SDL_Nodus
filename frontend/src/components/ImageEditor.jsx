import { useState, useRef, useEffect, useCallback } from 'react';
import './ImageEditor.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * ImageEditor Component
 * Provides crop and rotate functionality for images
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

  // Image dimensions for display
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });

  const [loadError, setLoadError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);

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
    const maxHeight = window.innerHeight - 300;

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
      const handleSize = 10;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
      ctx.fillRect(x + w - handleSize/2, y - handleSize/2, handleSize, handleSize);
      ctx.fillRect(x - handleSize/2, y + h - handleSize/2, handleSize, handleSize);
      ctx.fillRect(x + w - handleSize/2, y + h - handleSize/2, handleSize, handleSize);
    }
  }, [displaySize, rotation, imageLoaded, isCropping, cropStart, cropEnd]);

  useEffect(() => {
    drawImage();
  }, [drawImage]);

  // Rotation handlers
  const rotateLeft = () => {
    setRotation((prev) => (prev - 90 + 360) % 360);
    // Reset crop when rotating
    setCropStart(null);
    setCropEnd(null);
  };

  const rotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
    // Reset crop when rotating
    setCropStart(null);
    setCropEnd(null);
  };

  // Crop handlers
  const toggleCropMode = () => {
    setIsCropping(!isCropping);
    if (isCropping) {
      // Exiting crop mode - clear selection
      setCropStart(null);
      setCropEnd(null);
    }
  };

  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e) => {
    if (!isCropping) return;
    const pos = getMousePos(e);
    setCropStart(pos);
    setCropEnd(pos);
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !isCropping) return;
    const pos = getMousePos(e);
    setCropEnd(pos);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
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
    };
    croppedImg.src = finalCanvas.toDataURL('image/jpeg', 0.92);
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
    };
    img.src = blobUrl;
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

  const hasCropSelection = cropStart && cropEnd &&
    Math.abs(cropEnd.x - cropStart.x) > 10 &&
    Math.abs(cropEnd.y - cropStart.y) > 10;

  const hasChanges = rotation !== 0 || imageRef.current?.src !== imageUrl;

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
          <button
            className="image-editor__btn"
            onClick={resetEdits}
            title="Reset all edits"
          >
            Reset
          </button>
        </div>
      </div>

      {isCropping && (
        <div className="image-editor__help">
          Click and drag on the image to select the area to crop
        </div>
      )}

      <div className="image-editor__canvas-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={`image-editor__canvas ${isCropping ? 'cropping' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
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
