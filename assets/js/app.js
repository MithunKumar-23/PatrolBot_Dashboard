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

  /* ================= Google Drive Image Slider =================== */
  const GAS_URL = "https://script.google.com/macros/s/AKfycbxX3JR9pnFvoWi7pS_5w_eNsynRej0fEJEt0or2EYeMud9I3fB0BK4_waPnKWQ4-WyM/exec"; // Apps Script-এর Web App URL বসান
  let sliderImages = [];
  let currentSlideIndex = 0;

  async function pollPhotos(){
    try {
      const msg = UI.$("capMsg");
      const img = UI.$("capImg");
      const strip = UI.$("capStrip");

      // Apps Script থেকে ছবির লিস্ট নিয়ে আসা
      const res = await fetch(GAS_URL);
      sliderImages = await res.json();

      if (!sliderImages || sliderImages.length === 0) {
        msg.style.display = "block";
        msg.textContent = "কোনো ছবি পাওয়া যায়নি।";
        img.hidden = true;
        return;
      }

      // মূল স্লাইডারে ছবি দেখানো
      img.src = sliderImages[currentSlideIndex];
      img.hidden = false;
      msg.style.display = "none";

      // নিচের ছোট স্ট্রিপে (thumbnail) স্লাইডারের ন্যাভিগেশন তৈরি করা
      strip.innerHTML = "";
      sliderImages.forEach((url, index) => {
        const im = document.createElement("img");
        im.src = url;
        im.style.cursor = "pointer";
        im.style.margin = "0 5px";
        im.style.width = "60px";
        im.style.height = "60px";
        im.style.objectFit = "cover";
        im.style.borderRadius = "5px";
        im.style.opacity = index === currentSlideIndex ? "1" : "0.5"; 
        
        // থাম্বনেইলে ক্লিক করলে স্লাইডার চেঞ্জ হবে
        im.onclick = () => {
          currentSlideIndex = index;
          pollPhotos();
        };
        strip.appendChild(im);
      });

    } catch(e) {
      console.log("Slider error:", e);
    }
  }

  // Next / Previous বাটনের জন্য ফাংশন 
  window.nextSlide = function() {
    if (sliderImages.length > 0) {
      currentSlideIndex = (currentSlideIndex + 1) % sliderImages.length;
      pollPhotos();
    }
  };

  window.prevSlide = function() {
    if (sliderImages.length > 0) {
      currentSlideIndex = (currentSlideIndex - 1 + sliderImages.length) % sliderImages.length;
      pollPhotos();
    }
  };
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
