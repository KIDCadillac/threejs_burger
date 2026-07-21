import {
  decodeSoloSave,
  hydrateSoloCookingState,
  serializeSoloSave,
} from "./cooking-solo-save.mjs";

export const SOLO_AUTOSAVE_STORAGE_KEY = "solo-cooking-burger-save:v1";

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createSoloAutosave({
  storage,
  storageKey = SOLO_AUTOSAVE_STORAGE_KEY,
} = {}) {
  const resolvedStorage = resolveStorage(storage);
  let lastSerialized = null;

  return Object.freeze({
    load() {
      try {
        if (typeof resolvedStorage?.getItem !== "function") return null;
        const serialized = resolvedStorage.getItem(storageKey);
        if (typeof serialized !== "string" || !serialized.length) return null;
        const decoded = decodeSoloSave(serialized);
        if (!decoded) return null;
        const restored = hydrateSoloCookingState(decoded.state);
        if (!restored) return null;
        lastSerialized = serialized;
        return restored;
      } catch {
        return null;
      }
    },

    save(state) {
      let serialized;
      try {
        serialized = serializeSoloSave(state);
      } catch {
        return false;
      }
      if (serialized === lastSerialized) return false;
      try {
        if (typeof resolvedStorage?.setItem !== "function") return false;
        resolvedStorage.setItem(storageKey, serialized);
        lastSerialized = serialized;
        return true;
      } catch {
        return false;
      }
    },

    clear() {
      try {
        if (typeof resolvedStorage?.removeItem !== "function") return false;
        resolvedStorage.removeItem(storageKey);
        lastSerialized = null;
        return true;
      } catch {
        return false;
      }
    },
  });
}
