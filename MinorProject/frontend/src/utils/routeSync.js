/**
 * Global Route Synchronization Utility
 *
 * Fires a deployment signal that ALL pages/components can listen to.
 * Works in both same-tab (CustomEvent) and cross-tab (localStorage) scenarios.
 */

const DEPLOY_EVENT = 'waste-route-deployed';
const STORAGE_KEY  = 'waste-deploy';

/**
 * Call this after ANY route-affecting deployment:
 *   Fleet Optimization, Intelligent Route Optimization, Manual Reroute,
 *   Road Blocked, Area Blocked, Area Priority, Epoch Deploy, etc.
 */
export function signalRouteDeploy() {
  // 1. Same-tab: fire a CustomEvent so all mounted components in this tab refresh
  window.dispatchEvent(new CustomEvent(DEPLOY_EVENT, { detail: { ts: Date.now() } }));

  // 2. Cross-tab: update localStorage so other tabs/windows pick it up via 'storage' event
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
}

/**
 * Subscribe to deployment signals (both same-tab and cross-tab).
 * Returns an unsubscribe function.
 *
 * @param {Function} callback — called with no args whenever a deploy signal fires
 */
export function onRouteDeploy(callback) {
  // Same-tab listener
  const handleCustom = () => callback();
  window.addEventListener(DEPLOY_EVENT, handleCustom);

  // Cross-tab listener (only fires in OTHER tabs)
  const handleStorage = (e) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', handleStorage);

  // Return cleanup
  return () => {
    window.removeEventListener(DEPLOY_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}
