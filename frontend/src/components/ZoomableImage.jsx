import { useState, useRef, useCallback, useEffect } from 'react';
import './ZoomableImage.css';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const WHEEL_ZOOM_STEP = 0.15;

const ZoomableImage = ({ src, alt, className = '', style = {} }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const pinchStartDist = useRef(null);
  const pinchStartZoom = useRef(1);

  // Reset zoom/pan when image source changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [src]);

  // Clamp pan to keep image in bounds
  const clampPan = useCallback((newPan, currentZoom) => {
    if (currentZoom <= 1) return { x: 0, y: 0 };
    const container = containerRef.current;
    if (!container) return newPan;
    const img = container.querySelector('img');
    if (!img) return newPan;

    const cRect = container.getBoundingClientRect();
    const scaledW = img.naturalWidth > 0 ? Math.min(img.naturalWidth, cRect.width) * currentZoom : cRect.width * currentZoom;
    const scaledH = img.naturalHeight > 0 ? Math.min(img.naturalHeight, cRect.height) * currentZoom : cRect.height * currentZoom;

    const maxX = Math.max(0, (scaledW - cRect.width) / 2);
    const maxY = Math.max(0, (scaledH - cRect.height) / 2);

    return {
      x: Math.max(-maxX, Math.min(maxX, newPan.x)),
      y: Math.max(-maxY, Math.min(maxY, newPan.y)),
    };
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
    setZoom(prev => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
      if (next <= 1) setPan({ x: 0, y: 0 });
      else setPan(p => clampPan(p, next));
      return next;
    });
  }, [clampPan]);

  // Attach wheel event with { passive: false } to prevent page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Mouse drag to pan
  const handleMouseDown = useCallback((e) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan(clampPan({ x: panStart.current.x + dx, y: panStart.current.y + dy }, zoom));
  }, [isDragging, zoom, clampPan]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Touch: pinch to zoom + drag to pan
  const getTouchDist = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      // Pinch start
      pinchStartDist.current = getTouchDist(e.touches);
      pinchStartZoom.current = zoom;
    } else if (e.touches.length === 1 && zoom > 1) {
      // Single finger drag when zoomed
      setIsDragging(true);
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStart.current = { ...pan };
    }
  }, [zoom, pan]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchStartDist.current !== null) {
      e.preventDefault();
      const currentDist = getTouchDist(e.touches);
      const scale = currentDist / pinchStartDist.current;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartZoom.current * scale));
      setZoom(newZoom);
      if (newZoom <= 1) setPan({ x: 0, y: 0 });
      else setPan(p => clampPan(p, newZoom));
    } else if (e.touches.length === 1 && isDragging) {
      e.preventDefault();
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      setPan(clampPan({ x: panStart.current.x + dx, y: panStart.current.y + dy }, zoom));
    }
  }, [isDragging, zoom, clampPan]);

  const handleTouchEnd = useCallback((e) => {
    if (e.touches.length < 2) {
      pinchStartDist.current = null;
    }
    if (e.touches.length === 0) {
      setIsDragging(false);
    }
  }, []);

  // Double tap/click to toggle zoom
  const lastTap = useRef(0);
  const handleDoubleAction = useCallback((clientX, clientY) => {
    if (zoom > 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(2.5);
    }
  }, [zoom]);

  const handleClick = useCallback((e) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      handleDoubleAction(e.clientX, e.clientY);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }, [handleDoubleAction]);

  const isZoomed = zoom > 1;

  return (
    <div
      ref={containerRef}
      className={`zoomable-image-container ${isZoomed ? 'zoomed' : ''} ${isDragging ? 'dragging' : ''} ${className}`}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={style}
    >
      <img
        src={src}
        alt={alt}
        className="zoomable-image"
        style={{
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
        }}
        draggable={false}
      />
      {isZoomed && (
        <div className="zoom-indicator">{Math.round(zoom * 100)}%</div>
      )}
    </div>
  );
};

export default ZoomableImage;
