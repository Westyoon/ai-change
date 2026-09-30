// Visual-only primitives. Radius and center remain in the game's logical space.
export const PIXEL_COLORS = Object.freeze({
  ink: "#52233f", shadow: "#30182e", paper: "#fff8e8",
  pink: "#d82f76", purple: "#363367", blue: "#2ab5e4", yellow: "#fdd044",
});

function fillSteppedDisc(context, x, y, radius, color) {
  const cell = radius / 4;
  context.fillStyle = color;
  for (let row = 0; row < 8; row += 1) {
    const inset = row === 0 || row === 7 ? 2 : row === 1 || row === 6 ? 1 : 0;
    context.fillRect(x - radius + inset * cell, y - radius + row * cell,
      (8 - 2 * inset) * cell, cell);
  }
}

export function drawPixelToken(context, x, y, radius, color) {
  const previousFill = context.fillStyle;
  fillSteppedDisc(context, x, y, radius, PIXEL_COLORS.ink);
  fillSteppedDisc(context, x, y, radius - 2, PIXEL_COLORS.shadow);
  fillSteppedDisc(context, x - 1, y - 1, radius - 3, color);
  context.fillStyle = PIXEL_COLORS.paper;
  const highlight = Math.max(2, Math.floor(radius / 4));
  context.fillRect(x - radius / 2, y - radius / 2, highlight, highlight);
  context.fillStyle = previousFill;
}
