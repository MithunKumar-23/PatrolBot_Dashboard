# Contributing

Thanks for looking! This is a small static dashboard — contributions
are welcome and the bar to entry is deliberately low.

## Ground rules

**No build step, no dependencies.** The whole point of this dashboard
is that a student can clone it, edit one line, and publish it. Please
don't introduce npm, a bundler, a framework, or a CDN script tag. If a
feature genuinely needs one, open an issue first so we can talk about
whether it's worth the tradeoff.

**Keep the layers separate.** Markup in `index.html`, styling in
`style.css`, behaviour in `assets/js/`. No inline `style=` or
`onclick=` attributes — events are bound in `app.js`.

**One responsibility per JS file:**

| File | Owns |
|---|---|
| `config.js` | user-editable settings, nothing else |
| `api.js` | every `fetch` call; no DOM access |
| `ui.js` | DOM helpers, formatting; no network access |
| `camera.js` | the MJPEG stream and its failure messaging |
| `app.js` | the polling loop and the glue between the above |

**Use `textContent` for anything the robot sent.** `/cmd` is
world-writable, so event text is untrusted input. `innerHTML` is only
acceptable for strings this repo authored.

## Local development

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Testing without a robot: point `databaseUrl` at your own Firebase
project and write a `/patrolbot/live` node by hand in the console. The
dashboard can't tell the difference.

## Style

- 2-space indent, semicolons, double quotes in JS.
- Comment the *why*, not the *what*. `// increment i` helps nobody;
  `// the RCWL extends its HIGH pulse, so edges undercount` does.
- CSS colours go through the `:root` variables — no hard-coded hex in
  rules.

## Pull requests

1. Describe what changed and what you tested it against (browser +
   whether you had real hardware).
2. Screenshots for anything visual.
3. Keep PRs focused — one feature or fix each.

## Reporting bugs

Include: browser and version, whether you were on the robot's Wi-Fi,
what the `☁ CLOUD` chip said, and anything in the DevTools console.
For firmware-side problems, the ESP32 Serial Monitor output is usually
the fastest route to an answer.
