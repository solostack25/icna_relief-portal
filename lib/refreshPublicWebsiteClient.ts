// Browser helper: ask the portal to refresh the public website after publishing or slot changes. Fire-and-forget.
export function refreshPublicWebsiteSoon() {
  fetch("/api/public-website/refresh", { method: "POST" }).catch(() => {});
}
