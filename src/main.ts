import "@fontsource-variable/instrument-sans";
import "./app.css";
import { mount } from "svelte";
import App from "./App.svelte";

const app = mount(App, { target: document.body });

// Register the service worker only in production builds. In development it
// would cache modules and break hot-reload.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.error(`Service worker registration failed: ${error}`);
  });
}

export default app;
