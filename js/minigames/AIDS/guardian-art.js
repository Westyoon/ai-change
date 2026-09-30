import { GUARDIAN_EGGS } from '../../core/guardian-inventory.js';

// Keep the existing two-way classification: 인지 (AI) left, 데사 (DS) right.
export const SORTING_GUARDIANS = Object.freeze({
    in: GUARDIAN_EGGS.find((egg) => egg.departmentCode === 'AI'),
    de: GUARDIAN_EGGS.find((egg) => egg.departmentCode === 'DS'),
});

export function createGuardianImage(doc, type, className) {
    const guardian = SORTING_GUARDIANS[type];
    const image = doc.createElement('img');
    image.className = className;
    image.src = guardian.imageSrc;
    image.alt = `${guardian.departmentName} ${guardian.name}`;
    image.draggable = false;
    image.width = 40;
    image.height = 40;
    return image;
}

export function updateEggRotation(egg, previousX, previousY, wasRolling, dt, radius) {
    if (wasRolling && dt > 0) {
        const dx = egg.x - previousX;
        const distance = Math.sign(dx) * Math.hypot(dx, egg.y - previousY);
        const turn = distance / radius * 180 / Math.PI;
        egg.angularVelocity = turn / dt;
        egg.rotation = (egg.rotation ?? 0) + turn;
    } else {
        // Carry the last roll into free fall; pausing never advances this clock.
        egg.rotation = (egg.rotation ?? 0) + (egg.angularVelocity ?? 0) * dt;
    }
    if (egg.sprite?.style) egg.sprite.style.transform = `rotate(${egg.rotation}deg)`;
}
