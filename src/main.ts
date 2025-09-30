import "./app.scss";
import App from "./App.svelte";

const app = new App({
  target: document.body!,
});

// Service worker registration
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    // Only register service worker in production
    navigator.serviceWorker.register("/sw.js").then(
      (registration) => {
        console.log("Service worker registration successful:", registration);
      },
      (error) => {
        console.error(`Service worker registration failed: ${error}`);
      },
    );
  } else {
    // In development, unregister any existing service workers
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (let registration of registrations) {
        registration.unregister();
        console.log("Unregistered service worker for development mode");
      }
    });
  }
}

export default app;
