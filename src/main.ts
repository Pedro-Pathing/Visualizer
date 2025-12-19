import "./app.scss";
import App from "./App.svelte";

const app = new App({
  target: document.body!,
});

// Initialize Google Analytics (if VITE_GA_ID is provided)
// Analytics is loaded via the static snippet in `index.html`.
// The runtime initializer is left in the codebase for optional use,
// but we avoid calling it to prevent duplicate tags.

export default app;
