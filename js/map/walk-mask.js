export function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Author polygons, rasterize once, then test every cell covered by the feet. */
export class WalkMask {
  constructor({ width, height, cellSize = 4, paths = [], obstacles = [], blockedPolygons = [] }) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.columns = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = new Uint8Array(this.columns * this.rows);
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const x = (column + 0.5) * cellSize;
        const y = (row + 0.5) * cellSize;
        this.cells[row * this.columns + column] = Number(
          paths.some(polygon => insidePolygon(x, y, polygon))
          && !obstacles.some(rect => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height)
          && !blockedPolygons.some(polygon=>insidePolygon(x,y,polygon)),
        );
      }
    }
  }

  allows(rect) {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0 || rect.x < 0 || rect.y < 0
      || rect.x + rect.width > this.width || rect.y + rect.height > this.height) return false;
    const left = Math.floor(rect.x / this.cellSize);
    const top = Math.floor(rect.y / this.cellSize);
    const right = Math.ceil((rect.x + rect.width) / this.cellSize) - 1;
    const bottom = Math.ceil((rect.y + rect.height) / this.cellSize) - 1;
    for (let row = top; row <= bottom; row++) {
      for (let column = left; column <= right; column++) {
        if (!this.cells[row * this.columns + column]) return false;
      }
    }
    return true;
  }
}
