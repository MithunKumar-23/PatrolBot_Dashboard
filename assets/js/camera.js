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
 * This module makes that difference legible instead of showing a
 * broken-image icon.
 */
window.PB_CAMERA = (function(){
  const cfg = window.PB_CONFIG;
  const UI  = window.PB_UI;

  let camIp = null;
  let retryTimer = null;

  function streamUrl(bust){
    return "http://" + camIp + ":81/stream" + (bust ? "?t=" + Date.now() : "");
  }

  function showOffline(){
    const img = UI.$("streamImg");
    const msg = UI.$("streamMsg");
    img.hidden = true;
    msg.style.display = "grid";
    UI.setText("liveDot", "● LOCAL ONLY");

    /* Two very different failures look identical to an <img>, so
       explain the likely one for the current context. */
    if (location.protocol === "https:"){
      msg.innerHTML =
        "📷 Video unavailable.<br><br>" +
        "<b>On the robot's Wi-Fi?</b> The browser is blocking the HTTP stream on this " +
        "HTTPS page. Click the padlock or ⓘ in the address bar → Site settings → " +
        "<b>Insecure content → Allow</b>, then reload.<br><br>" +
        "<b>Away from home?</b> This is expected — the camera lives on a private " +
        "address (" + (camIp || "192.168.x.x") + ") that only exists on your local " +
        "network. Sensor data above keeps working.";
    } else {
      msg.textContent =
        "📷 Camera unreachable at " + (camIp || "—") +
        " — check that the ESP32-CAM is powered on and on the same network.";
    }
  }

  function start(){
    if (!camIp) return;
    const img = UI.$("streamImg");
    const msg = UI.$("streamMsg");

    clearTimeout(retryTimer);

    img.onload = function(){
      img.hidden = false;
      msg.style.display = "none";
      UI.setText("liveDot", "● LIVE");
    };
    img.onerror = function(){
      showOffline();
      retryTimer = setTimeout(function(){
        if (camIp) img.src = streamUrl(true);
      }, cfg.streamRetryMs);
    };

    img.hidden = true;
    msg.style.display = "grid";
    msg.textContent = "connecting to " + camIp + " …";
    img.src = streamUrl(false);
  }

  /**
   * Called on every telemetry poll. The robot publishes whichever IP
   * mDNS resolved, so the page never hard-codes an address that DHCP
   * will change tomorrow.
   */
  function setIpFromCloud(ip){
    if (!ip || ip === camIp) return;
    camIp = ip;
    const input = UI.$("camInput");
    if (input && !input.value) input.value = ip;
    start();
  }

  /** Manual override for networks where mDNS is blocked. */
  function setIpManual(ip){
    if (!ip){ UI.toast("Enter the camera IP first"); return; }
    camIp = ip.trim();
    UI.toast("Connecting to " + camIp + " …");
    start();
  }

  function getIp(){ return camIp; }

  return { setIpFromCloud, setIpManual, getIp, start };
})();
