/**
 * PatrolBot dashboard — local MJPEG camera
 * ========================================
 * The video deliberately does NOT go through the cloud: an ESP32-CAM
 * cannot do TLS at 15 fps, and relaying MJPEG would need a paid
 * server. The stream is fetched straight from the camera's private IP,
 * which means:
 *
 *   • same Wi-Fi as the robot → works (after allowing insecure content)
 *   • anywhere else           → unreachable, and that is expected
 *
 * [FIX-13] THE "connecting…" HANG
 * -------------------------------
 * The previous version relied on the <img> element's onload/onerror
 * events. That works for an ordinary image, but not here:
 *
 *   1. When the browser blocks the request as mixed content (HTTPS
 *      page, HTTP stream) it fires NEITHER event. The panel therefore
 *      sat on "connecting to 192.168.x.x …" forever, with no clue why.
 *   2. An MJPEG stream never "finishes loading", so onload arrives
 *      only after the first complete frame — on a slow link that can
 *      take seconds, which looks identical to a hang.
 *   3. A private IP that does not exist on the current network takes
 *      30+ seconds to time out at the TCP layer before onerror fires.
 *
 * The fix is a watchdog: if no frame has arrived within
 * cfg.streamTimeoutMs, stop waiting and show a diagnosis based on what
 * the page can actually detect (page protocol, reachability probe).
 */
window.PB_CAMERA = (function(){
  const cfg = window.PB_CONFIG;
  const UI  = window.PB_UI;

  let camIp      = null;
  let retryTimer = null;
  let watchdog   = null;
  let live       = false;
  let attempts   = 0;

  function streamUrl(bust){
    return "http://" + camIp + ":81/stream" + (bust ? "?t=" + Date.now() : "");
  }

  function setOpenLink(){
    const a = UI.$("btnOpenStream");
    if (a) a.href = camIp ? streamUrl(false) : "#";
  }

  /**
   * Probe the camera's control port. We cannot read the response
   * (no-cors forbids it), but we CAN tell "something answered" from
   * "nothing answered" — enough to separate a browser-blocked failure
   * from an unreachable camera, which need completely different fixes.
   */
  async function probe(){
    if (!camIp) return false;
    try{
      const opts = { mode: "no-cors", cache: "no-store" };
      if (window.AbortSignal && AbortSignal.timeout){
        opts.signal = AbortSignal.timeout(4000);
      }
      await fetch("http://" + camIp + "/photo?probe=" + Date.now(), opts);
      return true;
    }catch(e){
      return false;
    }
  }

  async function showOffline(){
    const img = UI.$("streamImg");
    const msg = UI.$("streamMsg");
    live = false;
    img.hidden = true;
    msg.style.display = "grid";
    UI.setText("liveDot", "● NO SIGNAL");

    const httpsPage = location.protocol === "https:";
    const reachable = await probe();

    if (httpsPage && !reachable){
      msg.innerHTML =
        "📷 <b>The browser is blocking the video.</b><br><br>" +
        "This page is HTTPS and the camera stream is plain HTTP, so it counts as " +
        "insecure content.<br><br>" +
        "<b>On the robot's Wi-Fi:</b> click the padlock / ⓘ / sliders icon at the " +
        "left of the address bar → <b>Site settings</b> → <b>Insecure content</b> → " +
        "<b>Allow</b> → reload. If that icon is missing, open " +
        "<span class='mono'>chrome://settings/content/insecureContent</span> and add " +
        "<span class='mono'>" + location.origin + "</span> to the Allow list.<br><br>" +
        "<b>Away from home:</b> this is expected — " +
        "<span class='mono'>" + (camIp || "192.168.x.x") + "</span> is a private " +
        "address that only exists on your local network. Sensor data and the " +
        "captured photos below keep working.<br><br>" +
        "Press <b>OPEN ↗</b> to test the stream directly in a new tab.";
    } else if (reachable){
      msg.innerHTML =
        "📷 The camera answered, but no video frames arrived.<br><br>" +
        "The ESP32-CAM serves <b>one MJPEG viewer at a time</b> — close any other " +
        "tab or the local dashboard, then press <b>RETRY</b>. If it still fails the " +
        "board is most likely browning out: give it a solid 5 V supply of at least " +
        "500 mA (not the L298N's 5 V pin).";
    } else {
      msg.innerHTML =
        "📷 Cannot reach <span class='mono'>" + (camIp || "—") + "</span>.<br><br>" +
        "Check that you are on the same Wi-Fi as the robot and that the ESP32-CAM is " +
        "powered on — its LED flashes twice when it joins the network.";
    }
  }

  function armWatchdog(){
    clearTimeout(watchdog);
    watchdog = setTimeout(function(){
      if (!live) showOffline();
    }, cfg.streamTimeoutMs || 9000);
  }

  function scheduleRetry(){
    clearTimeout(retryTimer);
    /* Back off: 8 s, 16 s, 24 s … capped at a minute. Hammering a
       browning-out ESP32-CAM every 8 s only keeps it down. */
    const wait = Math.min((cfg.streamRetryMs || 8000) * Math.min(attempts, 8), 60000);
    retryTimer = setTimeout(function(){ if (camIp) start(); }, wait);
  }

  function start(){
    if (!camIp) return;
    const img = UI.$("streamImg");
    const msg = UI.$("streamMsg");

    attempts++;
    clearTimeout(retryTimer);
    setOpenLink();

    img.onload = function(){
      live = true;
      attempts = 0;
      clearTimeout(watchdog);
      img.hidden = false;
      msg.style.display = "none";
      UI.setText("liveDot", "● LIVE");
    };
    img.onerror = function(){
      showOffline();
      scheduleRetry();
    };

    live = false;
    img.hidden = true;
    msg.style.display = "grid";
    msg.textContent = "connecting to " + camIp + " …";

    /* Cache-bust every attempt. Without this, a browser that already
       failed on this exact URL serves the failure from cache and never
       touches the network again. */
    img.src = streamUrl(true);
    armWatchdog();
  }

  /**
   * Called on every telemetry poll. The robot publishes whichever IP
   * mDNS resolved, so the page never hard-codes an address that DHCP
   * will change tomorrow.
   */
  function setIpFromCloud(ip){
    if (!ip || ip === camIp) return;
    camIp = ip;
    attempts = 0;
    const input = UI.$("camInput");
    if (input && !input.value) input.value = ip;
    start();
  }

  /** Manual override for networks where mDNS is blocked. */
  function setIpManual(ip){
    if (!ip){ UI.toast("Enter the camera IP first"); return; }
    camIp = ip.trim();
    attempts = 0;
    UI.toast("Connecting to " + camIp + " …");
    start();
  }

  /** RETRY button — immediate, ignores the back-off timer. */
  function retry(){
    if (!camIp){ UI.toast("No camera IP yet — is the robot online?"); return; }
    attempts = 0;
    UI.toast("Retrying " + camIp + " …");
    start();
  }

  function getIp(){ return camIp; }

  return { setIpFromCloud, setIpManual, retry, getIp, start };
})();
