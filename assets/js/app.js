/**
 * PatrolBot dashboard — application logic
 * =======================================
 * Polls Firebase for telemetry and events, paints the UI, and sends
 * remote commands. Everything network-facing lives in api.js; this
 * file is the glue.
 */
(function(){
  const cfg = window.PB_CONFIG;
  const API = window.PB_API;
  const UI  = window.PB_UI;
  const CAM = window.PB_CAMERA;

  let patrolOn      = true;
  let sliderTouched = false;
  let lastAlertKey  = "";

  /* ================= telemetry ==================================== */
  async function pollLive(){
    try{
      const d = await API.getLive();
      if (!d) throw new Error("empty");

      UI.setClass(UI.$("chipCloud"), "chip", "on");
      UI.setText("chipCloud", "☁ CLOUD OK");

      /* Staleness: a frozen dashboard looks exactly like a calm one,
         which is the worst failure mode a security display can have.
         The robot stamps every record with the Firebase SERVER clock
         (it has no RTC), so this comparison is trustworthy. */
      const age   = Date.now() - (d.ts || 0);
      const stale = age > cfg.staleAfterMs;

      UI.$("bStale").className = "banner stale" + (stale ? " show" : "");
      UI.setClass(UI.$("chipBot"), "chip", stale ? "bad" : "on");
      UI.setText("chipBot", stale ? "🤖 OFFLINE" : "🤖 ONLINE");
      UI.setText("age", "updated " + UI.ago(age));

      UI.setText("subInfo",
        (d.botIp ? "robot " + d.botIp : "") + (d.camIp ? " · cam " + d.camIp : ""));

      CAM.setIpFromCloud(d.camIp);

      /* ---- distances ---- */
      const dist = UI.$("tDist");
      dist.textContent = (d.dist != null ? d.dist : "—");
      UI.setClass(dist, "v", d.dist < 30 ? "bad" : d.dist < 60 ? "warn" : "acc");
      UI.setText("tLR", d.distL + " / " + d.distR);

      /* ---- alerts ---- */
      const fire = UI.$("tFire");
      fire.textContent = d.fire ? "🔥 FIRE" : "SAFE";
      UI.setClass(fire, "v", d.fire ? "bad" : "ok");

      const motion = UI.$("tMotion");
      motion.textContent = d.motion ? "⚠ ALERT" : "CLEAR";
      UI.setClass(motion, "v", d.motion ? "bad" : "ok");
      UI.setText("tHits", "verifying " + (d.hits || 0) + "/" + cfg.motionNeed);

      const radar = UI.$("tRadar");
      radar.textContent = d.radar ? "● ACTIVE" : "○ quiet";
      UI.setClass(radar, "v", d.radar ? "warn" : "ok");
      UI.setClass(UI.$("chipRadar"), "chip", d.radar ? "on" : "off");

      /* ---- status ---- */
      UI.setText("tState",  d.state || "—");
      UI.setText("tPhotos", d.photos != null ? d.photos : "—");
      UI.setText("tRssi",   d.rssi != null ? d.rssi + " dBm" : "—");
      UI.setText("tUp",     "up " + Math.floor((d.up || 0) / 60) + " min");

      /* ---- banners: suppressed when stale, so a dead robot's last
              alarm doesn't flash on screen forever ---- */
      UI.$("bFire").className   = "banner fire"   + ((d.fire   && !stale) ? " show" : "");
      UI.$("bMotion").className = "banner motion" + ((d.motion && !stale) ? " show" : "");

      const key = (d.fire ? "F" : "") + (d.motion ? "M" : "");
      if (key && key !== lastAlertKey && !stale) UI.beep(d.fire ? 880 : 660);
      lastAlertKey = key;

      /* ---- control state mirrors the robot, not the last click ---- */
      patrolOn = !!d.patrol;
      const pb = UI.$("btnPatrol");
      pb.textContent = patrolOn ? "⏸ STOP PATROL" : "▶ START PATROL";
      pb.className   = "btn " + (patrolOn ? "halt" : "go");

      if (!sliderTouched && d.speed){
        UI.$("speedSlider").value = d.speed;
        UI.setText("speedLabel", d.speed);
      }
    }catch(e){
      UI.setClass(UI.$("chipCloud"), "chip", "bad");
      UI.setText("chipCloud", "☁ CLOUD ERROR");
    }
  }

  /* ================= event history ================================ */
  async function pollEvents(){
    try{
      UI.renderEvents(await API.getEvents());
    }catch(e){
      /* keep whatever is already on screen rather than blanking it */
    }
  }

  /* ================= remote control =============================== */
  async function send(act, val){
    if (!cfg.enableControls){
      UI.toast("Controls are disabled in config.js");
      return;
    }
    const pin = UI.getPin();
    if (!pin){ UI.toast("❌ PIN required to control the robot"); return; }

    try{
      await API.sendCommand(act, val, pin);
      UI.toast("📡 Sent: " + act + " — the robot applies it within ~2 s");
      if (act === "speed") sliderTouched = true;
    }catch(e){
      UI.toast("❌ Could not reach Firebase (" + e.message + ")");
    }
  }

  /* ================= wiring ======================================= */
  function bind(){
    document.querySelectorAll("[data-cmd]").forEach(function(el){
      el.addEventListener("click", function(){ send(el.dataset.cmd, 0); });
    });

    UI.$("btnPatrol").addEventListener("click", function(){
      send("patrol", patrolOn ? 0 : 1);
    });

    const slider = UI.$("speedSlider");
    slider.addEventListener("input",  function(){ UI.setText("speedLabel", this.value); });
    slider.addEventListener("change", function(){ send("speed", this.value); });

    UI.$("btnConnect").addEventListener("click", function(){
      CAM.setIpManual(UI.$("camInput").value);
    });
    UI.$("camInput").addEventListener("keydown", function(e){
      if (e.key === "Enter") CAM.setIpManual(this.value);
    });

    if (!cfg.enableControls){
      ["btnPatrol", "btnSnap", "btnAck", "speedSlider"].forEach(function(id){
        const el = UI.$(id);
        if (el) el.disabled = true;
      });
    }
  }

  /* ================= start ======================================== */
  function init(){
    bind();

    if (!API.isConfigured()){
      UI.setText("subInfo", "⚠ edit assets/js/config.js — databaseUrl is still a placeholder");
      UI.setClass(UI.$("chipCloud"), "chip", "bad");
      UI.setText("chipCloud", "☁ NOT CONFIGURED");
      UI.toast("Set your Firebase URL in assets/js/config.js");
      return;
    }

    pollLive();
    pollEvents();
    setInterval(pollLive,   cfg.pollMs);
    setInterval(pollEvents, cfg.eventPollMs);

    /* Coming back to a backgrounded tab should feel instant rather
       than showing up-to-1.5-s-old data. */
    document.addEventListener("visibilitychange", function(){
      if (!document.hidden){ pollLive(); pollEvents(); }
    });
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
