# Security Policy

## What this project is

A hobby/student security robot. The threat model below is written
honestly so you can decide what to expose — please read it before
pointing this at a home you actually care about.

## What is protected

| Asset | Protection |
|---|---|
| Sensor telemetry (`/live`) | Public read by design. Only the robot, holding the database secret, can write. Nobody can forge readings. |
| Alert history (`/events`) | Same — public read, authenticated write. History can't be wiped by a stranger. |
| Google Drive photos | Never public. They go to your own Drive via Apps Script; only the file links you share are viewable. |
| Database secret | Lives only in `firebase.h`, compiled into the ESP32. Never in the web page. |

## What is NOT protected

**The command channel.** `/cmd` has to be world-writable, because a
static page hosted on GitHub Pages holds no credentials to authenticate
with. Authorisation happens in firmware instead: every command must
carry the correct `FB_CTRL_PIN` or the robot ignores it and logs a
`security` event.

That means:

- The PIN travels in **plaintext** over HTTPS to a world-writable node.
- A short numeric PIN is **brute-forceable** by anyone who finds your
  database URL. The robot rate-limits nothing.
- Anyone can **read** `/cmd` and see the PIN of the last command sent.
  ⚠ This is the sharpest edge: one successful command by you exposes
  the PIN to any reader.

**Your telemetry is public.** Anyone with the URL can see when motion
is detected at your home, and when the robot goes offline. That is a
meaningful privacy leak — an observer learns your presence patterns.

**The camera stream is unauthenticated** on your LAN. Anyone on the
same Wi-Fi can open `http://<cam-ip>:81/stream`.

## Recommended hardening

Pick according to how much you care:

1. **View-only** — set `enableControls: false` in `config.js` and
   `FB_ENABLED true` with no `/cmd` rule at all (`".write": false`).
   You lose remote control, and the PIN-exposure problem disappears.
2. **Don't publish the URL** — GitHub Pages is public, but the Firebase
   URL is only in your repo. A private repo with Pages enabled (paid
   plans) or simply not sharing the link raises the bar a lot.
3. **Rotate the PIN** after each session, since the last one is
   readable in `/cmd`.
4. **Change `basePath`** to something unguessable, e.g.
   `/patrolbot-7f3a9c`, in both `firebase.h` and `config.js`. Security
   by obscurity is weak, but it costs nothing here.
5. **Proper fix** — put a tiny authenticated function (Firebase Cloud
   Functions, or any server you control) in front of `/cmd` and drop
   the world-writable rule. This is the only approach that actually
   holds up; everything above is mitigation.

## Do not use this for

- Anything where a false negative matters (an actual alarm system).
- Monitoring people who haven't consented to it.
- Any deployment where the consequences of someone driving your robot,
  triggering the buzzer at 3 a.m., or learning your presence patterns
  would be more than an annoyance.

## Reporting a vulnerability

Open a GitHub issue. This is a hobby project with no security SLA — if
you find something, a public issue helps other builders most.
