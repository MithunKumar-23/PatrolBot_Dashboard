/**
 * PatrolBot dashboard — Firebase REST layer
 * =========================================
 * Deliberately uses plain fetch() against the Realtime Database REST
 * endpoint instead of the Firebase JS SDK:
 *
 *   • no 200 KB SDK download on a page that reads three small nodes
 *   • no apiKey / appId / authDomain to paste — one URL is enough
 *   • works offline-first: a failed poll just keeps the last values
 *
 * The tradeoff is polling instead of push. At 1.5 s that is
 * indistinguishable from realtime for a robot that reports every 3 s.
 */
window.PB_API = (function(){
  const cfg  = window.PB_CONFIG;
  const root = cfg.databaseUrl.replace(/\/+$/, "") + cfg.basePath;

  /** True while the placeholder URL has not been replaced. */
  function isConfigured(){
    return !/xxxxx/.test(cfg.databaseUrl);
  }

  /** Latest telemetry snapshot, or null if unreachable. */
  async function getLive(){
    const r = await fetch(root + "/live.json", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  /**
   * Newest alert events, newest first.
   * Firebase push-IDs sort chronologically, so ordering by $key and
   * taking the last N is the cheapest way to get "most recent".
   * Requires  "events": { ".indexOn": ".key" }  in the rules.
   */
  async function getEvents(){
    const url = root + '/events.json?orderBy=%22%24key%22&limitToLast=' + cfg.eventLimit;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    if (!data) return [];
    return Object.values(data).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  /**
   * [NEW v4.6] The most recent capture, as published by Apps Script
   * after it saves the file to Drive. Returns null before the first
   * photo exists — the dashboard treats that as "no captures yet"
   * rather than an error.
   */
  async function getLastPhoto(){
    const r = await fetch(root + "/lastphoto.json", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  /** Recent captures for the thumbnail strip, newest first. */
  async function getPhotos(){
    const r = await fetch(root + "/photos.json", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    if (!data) return [];
    return Object.values(data).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  /**
   * Queue one command for the robot.
   * PUT (not POST) so /cmd always holds exactly one command. The robot
   * compares `id` against the last one it executed, so re-sending the
   * same action always works, but a stale command never re-fires after
   * a reboot.
   *
   * `pin` is checked in firmware, not in the security rules — /cmd has
   * to stay world-writable because a static page holds no credentials.
   */
  async function sendCommand(act, val, pin){
    const r = await fetch(root + "/cmd.json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id:  Date.now(),
        act: act,
        val: Number(val) || 0,
        pin: Number(pin)
      })
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return true;
  }

  return { isConfigured, getLive, getEvents, getLastPhoto, getPhotos, sendCommand };
})();
