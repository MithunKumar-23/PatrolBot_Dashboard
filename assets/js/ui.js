/**
 * PatrolBot dashboard — small UI helpers
 * ======================================
 * DOM lookup, toasts, alert beeps, relative timestamps, and the
 * control-PIN prompt. Nothing here talks to the network.
 */
window.PB_UI = (function(){
  const cfg = window.PB_CONFIG;
  const PIN_KEY = "patrolbot_pin";
  let audioCtx = null;

  function $(id){ return document.getElementById(id); }

  /** Brief message at the bottom of the screen. */
  function toast(msg){
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "show";
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.className = ""; }, 2200);
  }

  /**
   * Short beep on a new alert.
   * Browsers block audio until the user has interacted with the page,
   * so the first alert on a freshly-opened tab may be silent. That is
   * a browser policy, not a bug — clicking anywhere unlocks it.
   */
  function beep(freq){
    if (!cfg.enableSound) return;
    try{
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    }catch(e){ /* audio unavailable — alerts are still visual */ }
  }

  /** "12s ago" / "4m ago" / "2h ago" */
  function ago(ms){
    const s = Math.round(ms / 1000);
    if (s < 0)    return "just now";
    if (s < 60)   return s + "s ago";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    return Math.round(s / 3600) + "h ago";
  }

  /** Toggle a class suffix on an element, e.g. setClass(el,'v','bad'). */
  function setClass(el, base, extra){
    if (el) el.className = extra ? base + " " + extra : base;
  }

  function setText(id, value){
    const el = $(id);
    if (el) el.textContent = value;
  }

  /**
   * The remote-control PIN (FB_CTRL_PIN in firebase.h).
   * Kept in localStorage so it is asked for once per browser. It is a
   * shared secret for a hobby robot, not an authentication system —
   * see SECURITY.md before exposing anything that matters.
   */
  function getPin(){
    let pin = localStorage.getItem(PIN_KEY);
    if (!pin){
      pin = prompt("Control PIN (the FB_CTRL_PIN you set in firebase.h):");
      if (pin) localStorage.setItem(PIN_KEY, pin.trim());
    }
    return pin;
  }

  function clearPin(){
    localStorage.removeItem(PIN_KEY);
    toast("PIN cleared — you'll be asked again on the next command");
  }

  /** Render the alert history list. */
  function renderEvents(list){
    const log = $("log");
    if (!log) return;
    log.innerHTML = "";
    setText("evCount", list.length ? "(" + list.length + ")" : "");

    if (!list.length){
      log.innerHTML = '<div class="ev">No events yet — the robot logs one on every boot.</div>';
      return;
    }
    for (const e of list){
      const div = document.createElement("div");
      div.className = "ev " + (e.type || "");
      /* textContent, not innerHTML: event text originates from the
         robot, and /cmd is world-writable, so treat it as untrusted. */
      div.textContent = e.msg || "(no message)";
      const time = document.createElement("span");
      time.className = "t";
      time.textContent = e.ts ? new Date(e.ts).toLocaleString() : "";
      div.appendChild(time);
      log.appendChild(div);
    }
  }

  return { $, toast, beep, ago, setClass, setText, getPin, clearPin, renderEvents };
})();
