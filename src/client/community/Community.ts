import {
  CommunityMapSummary,
  CommunityUser,
  communityMapId,
} from "@openfront/engine-api/game/CommunityMaps";
let account: CommunityUser | null = null;
let initialized: Promise<void> | undefined;
let published: CommunityMapSummary[] = [];
export function communityUser() {
  return account;
}
function setAccount(user: CommunityUser | null) {
  account = user;
  document.body?.classList.toggle("community-admin", user?.role === "admin");
  window.dispatchEvent(new CustomEvent("community-session"));
}
export async function communityRequest<T = any>(
  route: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/community${route}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-DeepFront": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({
    error: "The account server is unavailable. Please try again.",
  }));
  if (!response.ok) {
    if (response.status === 401) setAccount(null);
    throw new Error(data.error || "Request failed.");
  }
  return data;
}
export async function loadPublishedMaps() {
  const response = await communityRequest<{ maps: CommunityMapSummary[] }>(
    "/maps",
  );
  published = response.maps;
  return published;
}
export function communityMapLabel(map: string) {
  const id = communityMapId(map);
  return id
    ? published.find((m) => m.id === id)?.name || "Community map"
    : undefined;
}
export function initializeCommunity() {
  return (initialized ??= (async () => {
    await Promise.allSettled([
      communityRequest<{ user: CommunityUser | null }>("/session").then((r) =>
        setAccount(r.user),
      ),
      loadPublishedMaps(),
    ]);
  })());
}
export function reloadAccountHome() {
  sessionStorage.setItem("deepfront.open-community", "1");
  window.location.reload();
}
export async function signOutCommunity() {
  await communityRequest("/logout", {});
  setAccount(null);
  history.replaceState(null, "", "/");
  window.showPage?.("page-play");
}
