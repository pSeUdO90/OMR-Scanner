export const LOGO_UPDATED_EVENT = "omr-logo-updated";

export function brandingLogoUrl(rev = 1) {
  return `/api/branding/logo?v=${rev}`;
}

export function notifyLogoUpdated() {
  window.dispatchEvent(new Event(LOGO_UPDATED_EVENT));
}
