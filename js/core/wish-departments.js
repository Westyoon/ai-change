import { GUARDIAN_EGGS } from "./guardian-inventory.js";

export const WISH_DEPARTMENTS = Object.freeze(GUARDIAN_EGGS.map((egg) => Object.freeze({
  code: egg.departmentCode, name: egg.departmentName, color: egg.color,
})));
export function getWishDepartment(code) {
  return WISH_DEPARTMENTS.find((department) => department.code === code) ?? null;
}
