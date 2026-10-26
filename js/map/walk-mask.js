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
    const bounds = (left, top, right, bottom) => ({
      left: Math.max(0, Math.floor(left / cellSize)),
      top: Math.max(0, Math.floor(top / cellSize)),
      right: Math.min(this.columns, Math.ceil(right / cellSize) + 1),
      bottom: Math.min(this.rows, Math.ceil(bottom / cellSize) + 1),
    });
    const paintPolygon = (polygon, value) => {
      const area = bounds(Math.min(...polygon.map(p=>p[0])), Math.min(...polygon.map(p=>p[1])),
        Math.max(...polygon.map(p=>p[0])), Math.max(...polygon.map(p=>p[1])));
      for(let row=area.top;row<area.bottom;row++) for(let column=area.left;column<area.right;column++) {
        if(insidePolygon((column+.5)*cellSize,(row+.5)*cellSize,polygon)) this.cells[row*this.columns+column]=value;
      }
    };
    // Rasterize the union, then subtract obstacles. Visit each shape's bounds,
    // preserving the original cell-center test without scanning every obstacle per cell.
    for(const polygon of paths) paintPolygon(polygon,1);
    for(const rect of obstacles) {
      const area=bounds(rect.x,rect.y,rect.x+rect.width,rect.y+rect.height);
      for(let row=area.top;row<area.bottom;row++) for(let column=area.left;column<area.right;column++) {
        const x=(column+.5)*cellSize,y=(row+.5)*cellSize;
        if(x>=rect.x&&x<rect.x+rect.width&&y>=rect.y&&y<rect.y+rect.height) this.cells[row*this.columns+column]=0;
      }
    }
    for(const polygon of blockedPolygons) paintPolygon(polygon,0);
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
