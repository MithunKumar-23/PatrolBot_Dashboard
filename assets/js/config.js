/**
 * PatrolBot dashboard — configuration
 * ===================================
 * This is the ONLY file you need to edit before publishing.
 *
 * databaseUrl: your Firebase Realtime Database URL, WITH https:// and
 *              WITHOUT a trailing slash. Copy it from
 *              Firebase console → Build → Realtime Database.
 *              Newer projects look like
 *              https://myproject-default-rtdb.asia-southeast1.firebasedatabase.app
 *
 * Is it safe to publish this URL? Yes — with the security rules from
 * the README, /live and /events are read-only to the public and only
 * the robot (which holds the database secret) can write to them. The
 * URL alone grants nobody any power over your robot.
 */
window.PB_CONFIG = {

  /* ---- required ------------------------------------------------- */
  databaseUrl: "https://patrolbot-eb5a6-default-rtdb.asia-southeast1.firebasedatabase.app",

  /* ---- paths (match firebase.h — change both or neither) -------- */
  basePath: "/patrolbot",

  /* ---- timing --------------------------------------------------- */
  pollMs:        1500,   // telemetry refresh
  eventPollMs:   6000,   // alert-history refresh
  staleAfterMs: 15000,   // no update for this long → "robot offline"
  photoPollMs:   8000,   // how often to check for a new capture
  streamRetryMs: 8000,   // camera reconnect base interval (backs off)
  /* [FIX-13] Give up waiting for the first video frame after this
     long. A mixed-content block fires no error event at all, so
     without a timeout the panel would say "connecting…" forever. */
  streamTimeoutMs: 9000,

  /* ---- features ------------------------------------------------- */
  enableControls: true,  // false = view-only dashboard, no /cmd writes
  enableSound:    true,  // browser beep on a new alert
  eventLimit:     20,    // how many history rows to fetch

  /* ---- motion confirmation count, only used for the "x/4" label -- */
  motionNeed: 4
};
