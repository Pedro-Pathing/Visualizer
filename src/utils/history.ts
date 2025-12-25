import { writable, get } from "svelte/store";
import _ from "lodash";

const MAX_HISTORY = 100; // Keep last 100 states to prevent memory issues

export interface State {
  startPoint: Point;
  lines: Line[];
  robotWidth: number;
  robotHeight: number;
}

const historyStore = writable<{
  past: State[];
  present: State | null;
  future: State[];
}>({
  past: [],
  present: null,
  future: [],
});

export const history = {
  subscribe: historyStore.subscribe,
  
  init(initialState: State) {
    historyStore.set({
      past: [],
      present: _.cloneDeep(initialState),
      future: [],
    });
  },

  push(newState: State) {
    historyStore.update((h) => {
      if (!h.present) return { ...h, present: _.cloneDeep(newState) };
      
      // Don't push if state hasn't changed
      if (_.isEqual(h.present, newState)) return h;

      let newPast = [...h.past, h.present];
      
      // Cap history size to prevent memory issues
      if (newPast.length > MAX_HISTORY) {
        newPast = newPast.slice(-MAX_HISTORY);
      }

      return {
        past: newPast,
        present: _.cloneDeep(newState),
        future: [],
      };
    });
  },

  undo() {
    let undoneState: State | null = null;
    historyStore.update((h) => {
      if (h.past.length === 0) return h;

      const previous = h.past[h.past.length - 1];
      const newPast = h.past.slice(0, h.past.length - 1);
      
      undoneState = previous;

      return {
        past: newPast,
        present: _.cloneDeep(previous),
        future: [h.present!, ...h.future],
      };
    });
    return undoneState;
  },

  redo() {
    let redoneState: State | null = null;
    historyStore.update((h) => {
      if (h.future.length === 0) return h;

      const next = h.future[0];
      const newFuture = h.future.slice(1);

      redoneState = next;

      return {
        past: [...h.past, h.present!],
        present: _.cloneDeep(next),
        future: newFuture,
      };
    });
    return redoneState;
  },

  canUndo() {
    return get(historyStore).past.length > 0;
  },

  canRedo() {
    return get(historyStore).future.length > 0;
  }
};
