"use strict";

const CACHE_PREFIX = "skillup-public-";
const CACHE_VERSION = "2026-07-30-1";
const PUBLIC_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";
const INSTALL_ASSETS = [
  OFFLINE_URL,
  "/icons/skillup-icon.svg",
  "/icons/skillup-maskable.svg",
  "/manifest.webmanifest",
];
const PRIVATE_PREFIXES = [
  "/api",
  "/admin",
  "/app",
  "/en/sign-in",
  "/en/onboarding",
  "/en/progress",
  "/en/learn",
];

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest"
  );
}

function isExplicitlyPublic(response) {
  const cacheBoundary = response.headers.get("x-skillup-cacheable");
  const cacheControl = (response.headers.get("cache-control") ?? "").toLowerCase();
  const robots = (response.headers.get("x-robots-tag") ?? "").toLowerCase();
  return (
    response.ok &&
    cacheBoundary === "public" &&
    !cacheControl.includes("private") &&
    !cacheControl.includes("no-store") &&
    !robots.includes("noindex")
  );
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(PUBLIC_CACHE);
  try {
    const response = await fetch(request);
    if (isExplicitlyPublic(response)) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match(OFFLINE_URL)) ?? Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(PUBLIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached ?? (await network) ?? Response.error();
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PUBLIC_CACHE).then((cache) => cache.addAll(INSTALL_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== PUBLIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivatePath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url.pathname)) event.respondWith(staleWhileRevalidate(request));
});
