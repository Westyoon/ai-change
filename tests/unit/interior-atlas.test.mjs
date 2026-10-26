import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CampusMapManager } from "../../js/map/map-manager.js";
import { createAtlasSprite } from "../../js/map/interior-skin.js";

const documentRef = {
  createElementNS(_namespace, tag) {
    return {
      tag, attributes: {}, children: [],
      setAttribute(key, value) { this.attributes[key] = String(value); },
      append(...nodes) { this.children.push(...nodes); },
    };
  },
};
function descendants(node, tag) {
  return [node, ...node.children.flatMap(child => descendants(child, tag))].filter(child => child.tag === tag);
}

test("compacted student partitions render full-width glass panels with complete end frames", async () => {
  const [config, skin] = await Promise.all(["campus", "interior-skin"].map(async name =>
    JSON.parse(await readFile(new URL(`../../data/maps/${name}.json`, import.meta.url), "utf8"))));
  const map = new CampusMapManager(config).get("student_center_interior");
  const walls = map.layout.items.filter(item => ["lounge-glass-v", "lounge-glass-h"].includes(item.asset));
  assert.equal(walls.length, 7);
  for (const [index, wall] of walls.entries()) {
    const sprite = createAtlasSprite(documentRef, skin.frames[wall.asset], { ...wall, id: `glass-${index}` });
    const pattern = descendants(sprite, "pattern")[0];
    const cellWidth = Number(pattern.attributes.width), cellHeight = Number(pattern.attributes.height);
    const vertical = wall.asset.endsWith("-v");
    assert.ok(Math.abs((vertical ? wall.width / cellWidth : wall.height / cellHeight) - 1) < 1e-10,
      "the narrow partition must show both side rails rather than crop a wider atlas tile");
    const count = vertical ? wall.height / cellHeight : wall.width / cellWidth;
    assert.ok(count >= 1 && Math.abs(count - Math.round(count)) < 1e-10,
      "both ends of every wall run must finish on a complete panel");
    const clip = descendants(sprite, "clipPath")[0];
    const sourceBounds = skin.frames[wall.asset].crop;
    for (const [key, value] of Object.entries(sourceBounds)) assert.equal(Number(clip.children[0].attributes[key]), value);
    const group = pattern.children[0];
    assert.equal(group.attributes["clip-path"], `url(#glass-${index}-clip)`);
    assert.equal(group.children[0].tag, "image", "repeated atlas imagery stays inside its own crop");
  }
});
