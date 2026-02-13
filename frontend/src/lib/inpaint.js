/**
 * Telea FMM (Fast Marching Method) Inpainting Algorithm
 *
 * Based on "An Image Inpainting Technique Based on the Fast Marching Method"
 * by Alexandru Telea (2004).
 *
 * Fills masked regions by propagating pixel values from the boundary inward,
 * using a weighted average of known pixels that considers directional alignment,
 * level-set distance, and geometric proximity.
 *
 * @param {ImageData} imageData - Canvas ImageData (RGBA)
 * @param {Uint8Array} mask - Mask array (width*height), 1 = inpaint, 0 = keep
 * @param {number} radius - Search radius for known pixel neighborhood (default 5)
 * @returns {ImageData} New ImageData with inpainted result
 */

const KNOWN = 0;
const BAND = 1;
const UNKNOWN = 2;

class MinHeap {
  constructor() {
    this.data = [];
    this.pos = new Map();
  }

  push(index, dist) {
    const node = { index, dist };
    this.data.push(node);
    this.pos.set(index, this.data.length - 1);
    this._bubbleUp(this.data.length - 1);
  }

  extractMin() {
    const min = this.data[0];
    const last = this.data.pop();
    this.pos.delete(min.index);
    if (this.data.length > 0) {
      this.data[0] = last;
      this.pos.set(last.index, 0);
      this._sinkDown(0);
    }
    return min;
  }

  decreaseKey(index, newDist) {
    const i = this.pos.get(index);
    if (i === undefined) return;
    if (newDist < this.data[i].dist) {
      this.data[i].dist = newDist;
      this._bubbleUp(i);
    }
  }

  has(index) {
    return this.pos.has(index);
  }

  get size() {
    return this.data.length;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].dist < this.data[parent].dist) {
        this._swap(i, parent);
        i = parent;
      } else {
        break;
      }
    }
  }

  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].dist < this.data[smallest].dist) {
        smallest = left;
      }
      if (right < n && this.data[right].dist < this.data[smallest].dist) {
        smallest = right;
      }
      if (smallest !== i) {
        this._swap(i, smallest);
        i = smallest;
      } else {
        break;
      }
    }
  }

  _swap(i, j) {
    this.pos.set(this.data[i].index, j);
    this.pos.set(this.data[j].index, i);
    [this.data[i], this.data[j]] = [this.data[j], this.data[i]];
  }
}

function solveEikonal(x, y, width, height, flags, dist) {
  const idx = y * width + x;
  let dX = 1e6;
  let dY = 1e6;

  // Horizontal neighbors
  if (x > 0 && flags[idx - 1] !== UNKNOWN) {
    dX = Math.min(dX, dist[idx - 1]);
  }
  if (x < width - 1 && flags[idx + 1] !== UNKNOWN) {
    dX = Math.min(dX, dist[idx + 1]);
  }

  // Vertical neighbors
  if (y > 0 && flags[idx - width] !== UNKNOWN) {
    dY = Math.min(dY, dist[idx - width]);
  }
  if (y < height - 1 && flags[idx + width] !== UNKNOWN) {
    dY = Math.min(dY, dist[idx + width]);
  }

  if (dX === 1e6 && dY === 1e6) return 1e6;
  if (dX === 1e6) return dY + 1;
  if (dY === 1e6) return dX + 1;

  const diff = Math.abs(dX - dY);
  if (diff < 1) {
    return (dX + dY + Math.sqrt(2 - diff * diff)) / 2;
  }
  return Math.min(dX, dY) + 1;
}

function gradientX(arr, x, y, width, flags) {
  const idx = y * width + x;
  const hasRight = x < width - 1 && flags[idx + 1] !== UNKNOWN;
  const hasLeft = x > 0 && flags[idx - 1] !== UNKNOWN;

  if (hasRight && hasLeft) return (arr[idx + 1] - arr[idx - 1]) / 2;
  if (hasRight) return arr[idx + 1] - arr[idx];
  if (hasLeft) return arr[idx] - arr[idx - 1];
  return 0;
}

function gradientY(arr, x, y, width, height, flags) {
  const idx = y * width + x;
  const hasDown = y < height - 1 && flags[idx + width] !== UNKNOWN;
  const hasUp = y > 0 && flags[idx - width] !== UNKNOWN;

  if (hasDown && hasUp) return (arr[idx + width] - arr[idx - width]) / 2;
  if (hasDown) return arr[idx + width] - arr[idx];
  if (hasUp) return arr[idx] - arr[idx - width];
  return 0;
}

function inpaintPixel(x, y, width, height, flags, dist, pixels, radius) {
  const idx = y * width + x;
  let sumR = 0, sumG = 0, sumB = 0;
  let sumWeight = 0;

  const r = Math.ceil(radius);
  const x0 = Math.max(0, x - r);
  const x1 = Math.min(width - 1, x + r);
  const y0 = Math.max(0, y - r);
  const y1 = Math.min(height - 1, y + r);

  // Get distance gradient at current pixel
  const gx = gradientX(dist, x, y, width, flags);
  const gy = gradientY(dist, x, y, width, height, flags);

  for (let ny = y0; ny <= y1; ny++) {
    for (let nx = x0; nx <= x1; nx++) {
      const nIdx = ny * width + nx;
      if (flags[nIdx] !== KNOWN) continue;

      const dx = x - nx;
      const dy = y - ny;
      const dirLength = Math.sqrt(dx * dx + dy * dy);
      if (dirLength === 0) continue;
      if (dirLength > radius) continue;

      // Normalize direction
      const ndx = dx / dirLength;
      const ndy = dy / dirLength;

      // Weight 1: directional alignment with distance gradient
      const wDir = Math.abs(ndx * gx + ndy * gy) + 1e-6;

      // Weight 2: level-set consistency
      const wLevel = 1.0 / (1.0 + Math.abs(dist[nIdx] - dist[idx]));

      // Weight 3: geometric proximity
      const wDist = 1.0 / (dirLength * dirLength);

      const weight = wDir * wLevel * wDist;

      const pIdx = nIdx * 4;
      sumR += weight * pixels[pIdx];
      sumG += weight * pixels[pIdx + 1];
      sumB += weight * pixels[pIdx + 2];
      sumWeight += weight;
    }
  }

  if (sumWeight > 0) {
    const pIdx = idx * 4;
    pixels[pIdx] = Math.round(sumR / sumWeight);
    pixels[pIdx + 1] = Math.round(sumG / sumWeight);
    pixels[pIdx + 2] = Math.round(sumB / sumWeight);
    // Alpha stays at 255
  }
}

export function inpaint(imageData, mask, radius = 5) {
  const width = imageData.width;
  const height = imageData.height;
  const totalPixels = width * height;

  // Create output copy
  const output = new ImageData(
    new Uint8ClampedArray(imageData.data),
    width,
    height
  );
  const pixels = output.data;

  // Initialize flags and distance arrays
  const flags = new Uint8Array(totalPixels);
  const dist = new Float32Array(totalPixels);
  const heap = new MinHeap();

  // Pass 1: Mark all pixels
  for (let i = 0; i < totalPixels; i++) {
    if (mask[i] === 1) {
      flags[i] = UNKNOWN;
      dist[i] = 1e6;
    } else {
      flags[i] = KNOWN;
      dist[i] = 0;
    }
  }

  // Pass 2: Find boundary pixels (UNKNOWN with at least one KNOWN neighbor)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (flags[idx] !== UNKNOWN) continue;

      let hasBoundary = false;
      if (x > 0 && flags[idx - 1] === KNOWN) hasBoundary = true;
      if (x < width - 1 && flags[idx + 1] === KNOWN) hasBoundary = true;
      if (y > 0 && flags[idx - width] === KNOWN) hasBoundary = true;
      if (y < height - 1 && flags[idx + width] === KNOWN) hasBoundary = true;

      if (hasBoundary) {
        flags[idx] = BAND;
        dist[idx] = 0;
        heap.push(idx, 0);
      }
    }
  }

  // Main FMM loop
  const neighbors = [-1, 1, -width, width]; // left, right, up, down

  while (heap.size > 0) {
    const { index: curIdx } = heap.extractMin();
    flags[curIdx] = KNOWN;

    const cx = curIdx % width;
    const cy = (curIdx - cx) / width;

    // Process 4-connected neighbors
    for (const offset of neighbors) {
      const nIdx = curIdx + offset;

      // Bounds check
      if (nIdx < 0 || nIdx >= totalPixels) continue;
      const nx = nIdx % width;
      const ny = (nIdx - nx) / width;

      // Ensure we don't wrap around rows
      if (offset === -1 && cx === 0) continue;
      if (offset === 1 && cx === width - 1) continue;

      if (flags[nIdx] === KNOWN) continue;

      // Solve eikonal equation for distance
      const newDist = solveEikonal(nx, ny, width, height, flags, dist);

      if (flags[nIdx] === UNKNOWN) {
        flags[nIdx] = BAND;
        dist[nIdx] = newDist;
        inpaintPixel(nx, ny, width, height, flags, dist, pixels, radius);
        heap.push(nIdx, newDist);
      } else if (newDist < dist[nIdx]) {
        dist[nIdx] = newDist;
        inpaintPixel(nx, ny, width, height, flags, dist, pixels, radius);
        heap.decreaseKey(nIdx, newDist);
      }
    }
  }

  return output;
}
