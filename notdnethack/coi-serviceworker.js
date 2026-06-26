/*! coi-serviceworker, MIT. Based on github.com/gzuidhof/coi-serviceworker.
 *
 * Injects the cross-origin isolation headers (COOP/COEP) client-side via a
 * service worker, so SharedArrayBuffer (and thus our PROXY_TO_PTHREAD build)
 * works on static hosts that cannot set HTTP headers, e.g. GitHub Pages.
 *
 * Bypass: load any page with ?http=true to skip the service worker entirely.
 * Use that for local testing where the dev server (web/serve.js) already sets
 * COOP/COEP itself, so no worker (and no HTTPS) is needed.
 */
if (typeof window === "undefined") {
    // ---- running as the service worker ----
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (ev.data && ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => self.clients.matchAll())
                .then((clients) => clients.forEach((c) => c.navigate(c.url)));
        }
    });

    self.addEventListener("fetch", (event) => {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;

        event.respondWith(
            fetch(r)
                .then((response) => {
                    if (response.status === 0) return response; // opaque
                    const headers = new Headers(response.headers);
                    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
                    headers.set("Cross-Origin-Opener-Policy", "same-origin");
                    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers,
                    });
                })
                .catch((e) => console.error(e))
        );
    });
} else {
    // ---- running on the page ----
    (() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("http") === "true") return;          // explicit local-dev bypass
        if (window.crossOriginIsolated !== false) return;    // already isolated (e.g. serve.js headers)
        if (!window.isSecureContext) {                       // SW needs https or localhost
            console.warn("coi: not a secure context; cross-origin isolation unavailable.");
            return;
        }
        const n = navigator;
        if (!n.serviceWorker) {
            console.warn("coi: service workers unavailable; SharedArrayBuffer will not work.");
            return;
        }
        n.serviceWorker
            .register(window.document.currentScript.src)
            .then((reg) => {
                reg.addEventListener("updatefound", () => window.location.reload());
                if (reg.active && !n.serviceWorker.controller) window.location.reload();
            })
            .catch((err) => console.error("coi: SW registration failed:", err));
    })();
}
