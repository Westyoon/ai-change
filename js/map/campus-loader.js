import { CampusMapManager } from "./map-manager.js";
import { campusResources, waitForResource } from "./resource-cache.js";
import { preloadCampusMap } from "./campus-layers.js";

export const CAMPUS_STUDENT_SPRITE = "./assets/maps/npcs/college-student-casual-v2.png";

export function createCampusLoader({ resources = campusResources } = {}) {
  let managerPromise;
  return {
    getManager({ signal } = {}) {
      if(signal?.aborted) return waitForResource(Promise.resolve(),signal);
      if (!managerPromise) {
        managerPromise = resources.json("./data/maps/campus.json")
          .then(config => new CampusMapManager(config))
          .catch(error => { managerPromise = null; throw error; });
      }
      return waitForResource(managerPromise, signal);
    },
  };
}

export const campusLoader = createCampusLoader();
let warmupPromise;

// Best effort, shared by the loading screen and campus scenes. Failures can retry on entry.
export function warmCampusMaps({ mode = "before", firstMapId = "ecc_interior" } = {}) {
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    const manager = await campusLoader.getManager();
    const ids = [firstMapId, ...manager.maps.keys()].filter((id, index, all) => all.indexOf(id) === index);
    for (const id of ids) {
      await preloadCampusMap(manager.get(id));
      manager.mask(id, { mode });
      if(mode === "before" && manager.get(id).interactions.some(point=>point.kind==="npc")) {
        await campusResources.image(CAMPUS_STUDENT_SPRITE);
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  })().finally(() => { warmupPromise = null; });
  return warmupPromise;
}

export function scheduleCampusWarmup(options) {
  const run = () => { void warmCampusMaps(options).catch(() => {}); };
  if (typeof globalThis.requestIdleCallback === "function") {
    const id = globalThis.requestIdleCallback(run, { timeout: 1200 });
    return () => globalThis.cancelIdleCallback?.(id);
  }
  const id = setTimeout(run, 100);
  return () => clearTimeout(id);
}
