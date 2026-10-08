// main.js – Video-Hintergrund mit Live-Blur & Dunst-Effekt (Nur 1 Quellvideo)

let socket;
let canvasMain, ctxMain;
let canvasMask, ctxMask;
let maskedCanvas, maskedCtx;
let video = document.createElement("video");
let isDrawing = false;
let currentStroke = [];
let revealStrokes = [];
let mySessionId = null; // Eigene Session-ID

// Einstellungen für Effekt und Zeichnen
const blurStrength = 8;                              // Stärke der Unschärfe (1 = leicht, 35 = realistischer Fenster-Blur, 80+ = starker Nebel)
const useFogTexture = true;                           // Echte Kondenswasser-/Dunst-Textur verwenden
const fogTextureOpacity = 0.75;                       // Sichtbarkeit der Wassertropfen/Dampf-Textur (0.0 bis 1.0)
const fogOverlayColor = "rgba(230, 240, 255, 0.30)";  // Zusätzliche halbtransparente Dunst-Tönung
const revealDuration = 0;                             // Sichtbarzeit in ms (0 = beginnt sofort auszublenden)
const fadeDuration = 3000;                            // Ausblendzeit in ms (wie lange der Nebel braucht, um wieder zuzuziehen)
const revealRadius = 25;                              // Radius des Wischers / Fingers
const maxConnectionDistance = 50;                     // Maximale Distanz für Linienverbindung
let serverMode = false;

let fogOverlayImg = new Image();
fogOverlayImg.src = "/static/fog_overlay.png";

let canvasBlur, ctxBlur;

function setup(isServer) {
  serverMode = isServer;
  socket = io();

  // Empfange die Session-ID vom Server
  socket.on("session_id", (data) => {
    mySessionId = data.session_id;
    console.log("Meine Session-ID:", mySessionId);
  });

  canvasMain = document.getElementById("canvas");
  ctxMain = canvasMain.getContext("2d");

  canvasMask = document.createElement("canvas");
  ctxMask = canvasMask.getContext("2d");

  maskedCanvas = document.createElement("canvas");
  maskedCtx = maskedCanvas.getContext("2d");

  canvasBlur = document.createElement("canvas");
  ctxBlur = canvasBlur.getContext("2d");

  // Video-Setup (muted + playsinline für garantierten Autoplay-Start)
  video.src = "/static/video.mp4";
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("loop", "");

  let started = false;

  function initApp() {
    if (started) return;
    started = true;

    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;

    canvasMain.width = width;
    canvasMain.height = height;
    canvasMask.width = width;
    canvasMask.height = height;
    maskedCanvas.width = width;
    maskedCanvas.height = height;

    // Mini-Canvas für butterweichen und performanten Box/Bilinear-Blur (funktioniert in allen Browsern)
    const blurFactor = Math.max(0.005, 1 / Math.max(1, blurStrength));
    canvasBlur.width = Math.max(6, Math.round(width * blurFactor));
    canvasBlur.height = Math.max(4, Math.round(height * blurFactor));

    video.play().catch(err => {
      console.log("Autoplay benötigt Nutzerinteraktion:", err);
    });

    // Fallback: Startet Video garantiert bei erstem Klick/Touch, falls Browser Autoplay verzögert
    const resumeVideo = () => {
      if (video.paused) {
        video.play();
      }
    };
    window.addEventListener("click", resumeVideo, { once: true });
    window.addEventListener("touchstart", resumeVideo, { once: true });

    if (serverMode) {
      // Maussteuerung
      updateCursor(revealRadius);
      canvasMain.addEventListener("mousedown", () => {
        isDrawing = true;
        currentStroke = [];
      });
      canvasMain.addEventListener("mouseup", () => {
        isDrawing = false;
        if (currentStroke.length > 0) {
          revealStrokes.push({ sessionId: mySessionId, points: currentStroke });
        }
      });
      canvasMain.addEventListener("mouseleave", () => {
        isDrawing = false;
        if (currentStroke.length > 0) {
          revealStrokes.push({ sessionId: mySessionId, points: currentStroke });
        }
      });
      canvasMain.addEventListener("mousemove", handleDraw);

      // Touchsteuerung
      canvasMain.addEventListener("touchstart", (e) => {
        e.preventDefault();
        isDrawing = true;
        currentStroke = [];
        handleTouchDraw(e);
      }, { passive: false });

      canvasMain.addEventListener("touchmove", (e) => {
        e.preventDefault();
        handleTouchDraw(e);
      }, { passive: false });

      canvasMain.addEventListener("touchend", () => {
        isDrawing = false;
        if (currentStroke.length > 0) {
          revealStrokes.push({ sessionId: mySessionId, points: currentStroke });
        }
      });

      canvasMain.addEventListener("touchcancel", () => {
        isDrawing = false;
        if (currentStroke.length > 0) {
          revealStrokes.push({ sessionId: mySessionId, points: currentStroke });
        }
      });

      socket.on("draw", data => {
        if (data.new) {
          revealStrokes.push({ sessionId: data.session_id, points: [] });
        }
        for (let i = revealStrokes.length - 1; i >= 0; i--) {
          if (revealStrokes[i].sessionId === data.session_id) {
            revealStrokes[i].points.push({ x: data.x, y: data.y, time: Date.now() });
            break;
          }
        }
      });
    } else {
      socket.on("draw", data => {
        if (data.new) {
          revealStrokes.push({ sessionId: data.session_id, points: [] });
        }
        for (let i = revealStrokes.length - 1; i >= 0; i--) {
          if (revealStrokes[i].sessionId === data.session_id) {
            revealStrokes[i].points.push({ x: data.x, y: data.y, time: Date.now() });
            break;
          }
        }
      });
    }

    requestAnimationFrame(animate);
  }

  video.onloadeddata = initApp;
  video.oncanplay = initApp;

  if (video.readyState >= 2) {
    initApp();
  }
}

function handleDraw(e) {
  if (!isDrawing) return;
  const rect = canvasMain.getBoundingClientRect();
  const scaleX = canvasMain.width / rect.width;
  const scaleY = canvasMain.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const time = Date.now();

  currentStroke.push({ x, y, time });
  socket.emit("draw", { x, y, new: currentStroke.length === 1, session_id: mySessionId });
}

function handleTouchDraw(e) {
  if (!isDrawing) return;
  const touch = e.touches[0];
  const rect = canvasMain.getBoundingClientRect();
  const scaleX = canvasMain.width / rect.width;
  const scaleY = canvasMain.height / rect.height;
  const x = (touch.clientX - rect.left) * scaleX;
  const y = (touch.clientY - rect.top) * scaleY;
  const time = Date.now();

  currentStroke.push({ x, y, time });
  socket.emit("draw", { x, y, new: currentStroke.length === 1, session_id: mySessionId });
}

function animate() {
  const now = Date.now();
  ctxMask.clearRect(0, 0, canvasMask.width, canvasMask.height);

  // Bestehende Striche zeichnen (nach Session gruppiert)
  for (let s = revealStrokes.length - 1; s >= 0; s--) {
    const stroke = revealStrokes[s];
    if (!stroke || !stroke.points || stroke.points.length === 0) continue;

    for (let i = stroke.points.length - 1; i >= 0; i--) {
      const current = stroke.points[i];
      const next = stroke.points[i + 1];

      const elapsed = now - current.time;
      let alpha = 1.0;
      if (elapsed > revealDuration) {
        const fadeElapsed = elapsed - revealDuration;
        alpha = 1.0 - (fadeElapsed / fadeDuration);
        if (alpha <= 0) {
          stroke.points.splice(i, 1);
          continue;
        }
      }

      ctxMask.save();
      ctxMask.globalAlpha = alpha;
      ctxMask.fillStyle = "white";
      ctxMask.strokeStyle = "white";
      ctxMask.lineWidth = revealRadius * 2;
      ctxMask.lineCap = "round";

      if (next && now - next.time < revealDuration + fadeDuration) {
        const distance = Math.sqrt(Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2));
        if (distance <= maxConnectionDistance) {
          ctxMask.beginPath();
          ctxMask.moveTo(next.x, next.y);
          ctxMask.lineTo(current.x, current.y);
          ctxMask.stroke();
        } else {
          ctxMask.beginPath();
          ctxMask.arc(current.x, current.y, revealRadius, 0, Math.PI * 2);
          ctxMask.fill();
        }
      } else {
        ctxMask.beginPath();
        ctxMask.arc(current.x, current.y, revealRadius, 0, Math.PI * 2);
        ctxMask.fill();
      }
      ctxMask.restore();
    }

    if (stroke.points.length === 0) {
      revealStrokes.splice(s, 1);
    }
  }

  // Aktuelle Linie (Live-Zeichnung beim Zeichnen)
  if (serverMode && currentStroke.length > 0) {
    for (let i = currentStroke.length - 1; i >= 0; i--) {
      const current = currentStroke[i];
      const next = currentStroke[i + 1];

      const elapsed = now - current.time;
      let alpha = 1.0;
      if (elapsed > revealDuration) {
        const fadeElapsed = elapsed - revealDuration;
        alpha = 1.0 - (fadeElapsed / fadeDuration);
        if (alpha <= 0) continue;
      }

      ctxMask.save();
      ctxMask.globalAlpha = alpha;
      ctxMask.fillStyle = "white";
      ctxMask.strokeStyle = "white";
      ctxMask.lineWidth = revealRadius * 2;
      ctxMask.lineCap = "round";

      if (next && now - next.time < revealDuration + fadeDuration) {
        const distance = Math.sqrt(Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2));
        if (distance <= maxConnectionDistance) {
          ctxMask.beginPath();
          ctxMask.moveTo(next.x, next.y);
          ctxMask.lineTo(current.x, current.y);
          ctxMask.stroke();
        } else {
          ctxMask.beginPath();
          ctxMask.arc(current.x, current.y, revealRadius, 0, Math.PI * 2);
          ctxMask.fill();
        }
      } else {
        ctxMask.beginPath();
        ctxMask.arc(current.x, current.y, revealRadius, 0, Math.PI * 2);
        ctxMask.fill();
      }
      ctxMask.restore();
    }
  }

  // 1. Hintergrund zeichnen: Video mit butterweichem Downscale-Blur (funktioniert in jedem Browser!)
  ctxBlur.drawImage(video, 0, 0, canvasBlur.width, canvasBlur.height);

  ctxMain.clearRect(0, 0, canvasMain.width, canvasMain.height);
  ctxMain.imageSmoothingEnabled = true;
  ctxMain.imageSmoothingQuality = "high";
  ctxMain.drawImage(canvasBlur, 0, 0, canvasMain.width, canvasMain.height);

  // 2. Realistische Dunst- / Kondenswasser-Textur darüberlegen
  if (useFogTexture && fogOverlayImg.complete && fogOverlayImg.naturalWidth > 0) {
    ctxMain.save();
    ctxMain.globalAlpha = fogTextureOpacity;
    ctxMain.globalCompositeOperation = "screen";
    ctxMain.drawImage(fogOverlayImg, 0, 0, canvasMain.width, canvasMain.height);
    ctxMain.restore();
  }

  // 3. Optionaler Farb-Dunst / Schleier
  if (fogOverlayColor) {
    ctxMain.fillStyle = fogOverlayColor;
    ctxMain.fillRect(0, 0, canvasMain.width, canvasMain.height);
  }

  // 4. Freigerubbelte Bereiche vorbereiten: Scharfes Video mit Maske ausschneiden
  maskedCtx.clearRect(0, 0, maskedCanvas.width, maskedCanvas.height);
  maskedCtx.globalCompositeOperation = "source-over";
  maskedCtx.drawImage(video, 0, 0, maskedCanvas.width, maskedCanvas.height);
  maskedCtx.globalCompositeOperation = "destination-in";
  maskedCtx.drawImage(canvasMask, 0, 0);

  // 5. Scharfes Video an den freigerubbelten Stellen über den Nebel zeichnen
  ctxMain.drawImage(maskedCanvas, 0, 0);

  requestAnimationFrame(animate);
}

function updateCursor(radius) {
  const size = radius * 2 + 4; // 4px Rand für Anti-Aliasing
  const cursorCanvas = document.createElement("canvas");
  cursorCanvas.width = size;
  cursorCanvas.height = size;

  const ctx = cursorCanvas.getContext("2d");
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  ctx.stroke();

  const dataURL = cursorCanvas.toDataURL("image/png");
  canvasMain.style.cursor = `url(${dataURL}) ${size / 2} ${size / 2}, auto`;
}
