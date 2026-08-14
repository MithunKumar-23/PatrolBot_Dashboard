# PatrolBot — Global Security Console

A dependency-free dashboard for the [PatrolBot](../README.md) autonomous
security robot. Host it on GitHub Pages and watch your ESP32's sensors
from anywhere in the world.

![status](https://img.shields.io/badge/build-static-blue)
![deps](https://img.shields.io/badge/dependencies-none-brightgreen)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

---

## What it shows

| | Source | Reachable from |
|---|---|---|
| Sensor telemetry | Firebase Realtime Database (HTTPS) | 🌍 anywhere |
| Alert history | Firebase, server-timestamped | 🌍 anywhere |
| Remote controls | Firebase `/cmd` + firmware PIN check | 🌍 anywhere (~2 s) |
| Live camera video | the robot's local IP (HTTP MJPEG) | 🏠 same Wi-Fi only |

The camera is intentionally **not** proxied through the cloud: an
ESP32-CAM cannot do TLS at 15 fps, and relaying MJPEG would need a paid
server. Telemetry is ~250 bytes every 3 s — about 7 MB/month, which
sits comfortably inside Firebase's free Spark plan.

---

## Quick start

```bash
git clone https://github.com/<you>/patrolbot-dashboard.git
cd patrolbot-dashboard
# edit ONE line:
$EDITOR assets/js/config.js      # set databaseUrl
```

Then **Settings → Pages → Branch `main` / `root` → Save**, wait a
minute, and open `https://<you>.github.io/patrolbot-dashboard/`.

To preview locally, any static server works:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

> Opening `index.html` directly with `file://` also mostly works, but a
> local server avoids browser quirks around fetch and localStorage.

---

## Prerequisites

1. A Firebase Realtime Database (free tier is enough).
2. PatrolBot firmware **v4.5+** flashed with your `FB_HOST`, `FB_AUTH`
   and `FB_CTRL_PIN` filled in.

Full walkthrough: [`../FIREBASE_SETUP.md`](../FIREBASE_SETUP.md).

### Security rules

Paste into **Realtime Database → Rules → Publish**:

```json
{
  "rules": {
    "patrolbot": {
      "live":   { ".read": true, ".write": "auth != null" },
      "events": { ".read": true, ".write": "auth != null", ".indexOn": ".key" },
      "cmd":    { ".read": true, ".write": true }
    }
  }
}
```

`/live` and `/events` are world-readable (that is the point of a public
dashboard) but only the robot — which holds the database secret — can
write them. `/cmd` must stay world-writable because a static page holds
no credentials; authorisation happens in firmware via the PIN. Read
[SECURITY.md](SECURITY.md) before pointing this at anything that
matters.

---

## Seeing the camera

The page is HTTPS and the MJPEG stream is plain HTTP, so browsers block
the mix by default. On your home Wi-Fi:

**Chrome / Edge (desktop)** — click the padlock or ⓘ left of the
address bar → **Site settings** → **Insecure content** → **Allow** →
reload.

**Chrome (Android)** — ⓘ → Permissions → Site settings → Insecure
content → Allow.

**Firefox** — `about:config` → set
`security.mixed_content.block_active_content` to `false`. This is a
global switch; turn it back on when you're done.

**Safari** — no per-site toggle. Use the robot's built-in dashboard at
`http://<robot-ip>/` instead while at home.

Away from home the video panel explains why it can't connect; the
telemetry keeps updating.

---

## File layout

```
.
├── index.html                  markup only — no inline styles or scripts
├── assets/
│   ├── css/style.css           all styling; theme colours in :root
│   ├── js/
│   │   ├── config.js           ← the only file you edit
│   │   ├── api.js              Firebase REST calls
│   │   ├── ui.js               DOM helpers, toasts, beeps, PIN storage
│   │   ├── camera.js           local MJPEG stream + offline messaging
│   │   └── app.js              polling loop, rendering, controls
│   └── img/favicon.svg
├── .github/workflows/deploy-pages.yml
├── .nojekyll                   stop Jekyll touching assets/
├── LICENSE                     MIT
├── SECURITY.md
├── CONTRIBUTING.md
└── README.md
```

No build step, no bundler, no npm. Edit a file, commit, done.

---

## Configuration reference

`assets/js/config.js`:

| Key | Default | Meaning |
|---|---|---|
| `databaseUrl` | placeholder | Firebase RTDB URL, with `https://`, no trailing slash |
| `basePath` | `/patrolbot` | must match the paths in `firebase.h` |
| `pollMs` | `1500` | telemetry refresh interval |
| `eventPollMs` | `6000` | alert-history refresh interval |
| `staleAfterMs` | `15000` | silence after this long → "robot offline" |
| `streamRetryMs` | `8000` | camera reconnect attempt interval |
| `enableControls` | `true` | `false` = view-only dashboard, no writes |
| `enableSound` | `true` | browser beep on a new alert |
| `eventLimit` | `20` | history rows fetched |
| `motionNeed` | `4` | only used for the `hits/4` label |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `☁ NOT CONFIGURED` | `databaseUrl` still has `xxxxx` | edit `config.js` |
| `☁ CLOUD ERROR` | wrong URL, or `.read` isn't `true` | check the URL in a browser: it should return JSON, not `Permission denied` |
| `🤖 OFFLINE` but the robot is running | it isn't reaching Firebase | Serial Monitor: look for `[FB] TLS connect FAILED` — usually no internet on the hotspot |
| Telemetry works, no events | `.indexOn` missing | add it to the rules and republish |
| `Remote command REJECTED` in Serial | browser PIN ≠ firmware PIN | DevTools → Application → Local Storage → delete `patrolbot_pin` |
| Camera never loads at home | insecure content still blocked | redo the browser steps above; confirm `http://<cam-ip>:81/stream` opens on its own |
| Everything blank, console shows 404s | GitHub Pages served from the wrong folder | Pages must point at the folder containing `index.html` |

---

## Browser support

Chrome/Edge 90+, Firefox 88+, Safari 15+. Uses `fetch`, CSS Grid and
`aspect-ratio` — nothing that needs a polyfill on those versions.

## License

MIT — see [LICENSE](LICENSE).
