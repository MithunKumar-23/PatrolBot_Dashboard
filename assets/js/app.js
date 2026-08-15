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
  /* Set one annunciator lamp: state class + the word inside it.
     Lamps latch as a unit (colour + bulb + label) so the operator
     reads position, not text. */
  function lamp(id, state, label){
    const el = UI.$(id);
    if (!el) return;
    el.className = "lamp" + (state ? " " + state : "");
    const span = el.querySelector("span");
    if (span) span.textContent = label;
  }

  async function pollLive(){
    try{
      const d = await API.getLive();
      if (!d) throw new Error("empty");

      lamp("chipCloud", "on", "Linked");

      /* Staleness: a frozen dashboard looks exactly like a calm one,
         which is the worst failure mode a security display can have.
         The robot stamps every record with the Firebase SERVER clock
         (it has no RTC), so this comparison is trustworthy. */
      const age   = Date.now() - (d.ts || 0);
      const stale = age > cfg.staleAfterMs;

      UI.$("bStale").className = "banner stale" + (stale ? " show" : "");
      lamp("chipBot", stale ? "bad" : "on", stale ? "Offline" : "On watch");
      UI.setText("age", stale ? "last seen " + UI.ago(age) : "updated " + UI.ago(age));

      UI.setText("subInfo",
        (d.botIp ? "robot " + d.botIp : "") + (d.camIp ? "  ·  cam " + d.camIp : ""));

      CAM.setIpFromCloud(d.camIp);

      /* ---- clearance ---- */
      const dist = UI.$("tDist");
      dist.textContent = (d.dist != null ? d.dist : "—");
      UI.setClass(dist, "", d.dist < 30 ? "bad" : d.dist < 60 ? "warn" : "acc");
      UI.setText("tLR", (d.distL != null ? d.distL : "—") + " / " +
                        (d.distR != null ? d.distR : "—"));

      /* ---- flame: three states, not two [FIX-12] ----
         A sensor that never releases is a wiring or threshold fault,
         and the firmware now says so. Showing it as FIRE forever just
         teaches you to ignore the panel. */
      const fire = UI.$("tFire");
      fire.textContent = d.fault ? "Fault" : (d.fire ? "Fire" : "Clear");
      UI.setClass(fire, "", d.fault ? "warn" : (d.fire ? "bad" : "ok"));
      lamp("lampFire", d.fault ? "warn" : (d.fire ? "bad" : "on"),
                       d.fault ? "Fault" : (d.fire ? "Fire" : "Clear"));

      /* ---- motion ---- */
      const motion = UI.$("tMotion");
      motion.textContent = d.motion ? "Alert" : "Clear";
      UI.setClass(motion, "", d.motion ? "bad" : "ok");
      UI.setText("tHits", (d.hits || 0) + " of " + cfg.motionNeed + " samples");
      lamp("lampMotion", d.motion ? "bad" : "on", d.motion ? "Intruder" : "Clear");

      /* ---- radar ---- */
      const radar = UI.$("tRadar");
      radar.textContent = d.radar ? "Active" : "Quiet";
      UI.setClass(radar, "", d.radar ? "warn" : "ok");
      lamp("chipRadar", d.radar ? "beam" : "", d.radar ? "Returning" : "Quiet");

      /* ---- status ---- */
      UI.setText("tState",  d.state || "—");
      UI.setText("tPhotos", d.photos != null ? d.photos : "—");
      UI.setText("tRssi",   d.rssi != null ? d.rssi + " dBm" : "—");
      UI.setText("tUp",     "up " + Math.floor((d.up || 0) / 60) + " min");

      /* ---- banners: suppressed when stale, so a dead robot's last
              alarm doesn't sit on screen forever ---- */
      UI.$("bFire").className   = "banner fire"   + ((d.fire && !d.fault && !stale) ? " show" : "");
      UI.$("bMotion").className = "banner motion" + ((d.motion && !stale) ? " show" : "");

      const key = (d.fire ? "F" : "") + (d.motion ? "M" : "");
      if (key && key !== lastAlertKey && !stale) UI.beep(d.fire ? 880 : 660);
      lastAlertKey = key;

      /* ---- controls mirror the robot, not the last click ---- */
      patrolOn = !!d.patrol;
      const pb = UI.$("btnPatrol");
      pb.textContent = patrolOn ? "Stop patrol" : "Start patrol";
      pb.className   = "btn " + (patrolOn ? "stop" : "go");
      lamp("lampPatrol", patrolOn ? "on" : "", patrolOn ? "Running" : "Held");

      if (!sliderTouched && d.speed){
        UI.$("speedSlider").value = d.speed;
        UI.setText("speedLabel", d.speed);
      }
    }catch(e){
      lamp("chipCloud", "bad", "No link");
      UI.setText("age", "no data");
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

  /* ================= captured photos [NEW v4.6] =================== *
   * The camera can only serve photos on a private LAN address, so the
   * cloud dashboard reads them from Drive instead: Apps Script
   * publishes each file's ID to Firebase right after saving it, and
   * Drive's thumbnail endpoint renders straight into an <img>.       */
  let lastPhotoId = null;

  /* [FIX-17] Google serves Drive images from several hosts, and the
     one the old code used (drive.google.com/thumbnail) 404s until
     Drive has generated a thumbnail — which for a photo uploaded
     seconds ago it has not. That is why captures reached Drive but
     never appeared here. Try each candidate in turn and keep the
     first that actually decodes. */
  function loadWithFallback(img, urls, onFail){
    let i = 0;
    function attempt(){
      if (i >= urls.length){ onFail(); return; }
      const url = urls[i++];
      if (!url){ attempt(); return; }
      img.onerror = attempt;
      img.onload  = function(){
        img.hidden = false;
        if (img.id === "capImg") UI.$("capMsg").style.display = "none";
      };
      img.src = url;
    }
    attempt();
  }

  async function pollPhotos(){
    try{
      const p = await API.getLastPhoto();
      const img  = UI.$("capImg");
      const msg  = UI.$("capMsg");
      const link = UI.$("capLink");

      if (!p || !p.id){
        msg.style.display = "block";
        msg.textContent = "No captures yet. Press “Capture now”, or wait for a motion alert.";
        img.hidden = true;
        return;
      }

      UI.setText("capAge", p.ts ? UI.ago(Date.now() - p.ts) : "");
      UI.setText("capName", p.name || "");

      /* Only touch img.src when the photo actually changed — otherwise
         every poll restarts the download and the panel flickers. */
      if (p.id !== lastPhotoId){
        lastPhotoId = p.id;
        link.href = p.view || "#";
        msg.style.display = "block";
        msg.textContent = "loading photo…";
        img.hidden = true;

        const camIp = CAM.getIp();
        loadWithFallback(img, [
          p.img,                                    // lh3 direct host
          p.alt1,                                   // drive thumbnail
          p.alt2,                                   // legacy uc?export=view
          p.thumb,                                  // small lh3
          camIp ? ("http://" + camIp + "/photo?t=" + Date.now()) : null
        ], function(){
          img.hidden = true;
          msg.style.display = "block";
          msg.innerHTML =
            "📸 A capture exists in Drive but no image host would serve it.<br><br>" +
            "In Apps Script confirm the sharing line runs " +
            "(<span class='mono'>ANYONE_WITH_LINK</span>), then redeploy as a " +
            "<b>new version</b>. Meanwhile the file itself is safe — " +
            "<a href='" + (p.view || "#") + "' target='_blank' rel='noopener'>open it in Drive</a>.";
        });
      }
    }catch(e){
      /* /lastphoto simply does not exist until the first upload. */
    }

    try{
      const list = await API.getPhotos();
      const strip = UI.$("capStrip");
      strip.innerHTML = "";
      for (const ph of list.slice(0, 12)){
        const a = document.createElement("a");
        a.href = ph.view || "#";
        a.target = "_blank";
        a.rel = "noopener";
        a.title = ph.ts ? new Date(ph.ts).toLocaleString() : (ph.name || "");
        const im = document.createElement("img");
        im.alt = ph.name || "capture";
        im.loading = "lazy";
        /* Same fallback chain, minus the local camera (which only ever
           holds the single most recent shot). */
        loadWithFallback(im, [ph.thumb, ph.alt1, ph.img, ph.alt2],
                         function(){ a.remove(); });
        a.appendChild(im);
        strip.appendChild(a);
      }
    }catch(e){ /* keep the previous strip */ }
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
      /* A capture takes ~2 s on the robot plus a Drive upload, so look
         again a few seconds later instead of making the user wait for
         the next scheduled poll. */
      if (act === "snap"){
        setTimeout(pollPhotos,  6000);
        setTimeout(pollPhotos, 14000);
      }
    }catch(e){
      UI.toast("❌ Could not reach Firebase (" + e.message + ")");
    }
  }

  /* ================= wiring ======================================= */
  function bind(){
    document.querySelectorAll("[data-cmd]").forEach(function(el){
      el.addEventListener("click", function(){
        send(el.dataset.cmd, 0);
        /* Visible busy state: a capture takes a few seconds end to end,
           and without feedback people press the button repeatedly —
           which used to queue several captures and make the camera look
           unreliable. */
        if (el.dataset.cmd === "snap"){
          const label = el.textContent;
          el.disabled = true;
          el.textContent = "⏳ Capturing…";
          setTimeout(function(){ el.disabled = false; el.textContent = label; }, 12000);
        }
      });
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
    UI.$("btnRetry").addEventListener("click", function(){ CAM.retry(); });
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
      UI.setText("subInfo", "Set databaseUrl in assets/js/config.js — it is still a placeholder");
      lamp("chipCloud", "warn", "Not set");
      UI.toast("Set your Firebase URL in assets/js/config.js");
      return;
    }

    pollLive();
    pollEvents();
    pollPhotos();
    setInterval(pollLive,   cfg.pollMs);
    setInterval(pollEvents, cfg.eventPollMs);
    setInterval(pollPhotos, cfg.photoPollMs || 8000);

    /* Coming back to a backgrounded tab should feel instant rather
       than showing up-to-1.5-s-old data. */
    document.addEventListener("visibilitychange", function(){
      if (!document.hidden){ pollLive(); pollEvents(); pollPhotos(); }
    });
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
