// Video hinter beschlagenem Glas – synchronisiert per Socket.IO.

let socket;
let canvasMain;
let ctxMain;
let canvasMask;
let ctxMask;
let canvasSharp;
let ctxSharp;
let canvasBlur;
let ctxBlur;
let canvasBlurSource;
let ctxBlurSource;
let canvasFog;
let ctxFog;
let canvasMasked;
let ctxMasked;

const video = document.createElement("video");
const fogOverlayImg = new Image();

let isDrawing = false;
let activePointerId = null;
let currentStroke = [];
let revealStrokes = [];
let mySessionId = null;
let serverMode = false;
let started = false;
let lastRenderedVideoTime = -1;
let blurFrameWidth = 0;
let blurFrameHeight = 0;
let blurPadding = 0;

const effect = {
  blurStrength: 8,
  blurRenderScale: 0.5,
  fogTextureOpacity: 0.38,
  fogTint: "rgba(210, 220, 224, 0.14)",
  revealDuration: 0,
  fadeDuration: 3000,
  revealRadius: 28,
  revealEdgeSoftness: 4,
  maxConnectionDistance: 100,
};

fogOverlayImg.decoding = "async";
fogOverlayImg.src = "/static/fog_overlay.png";
fogOverlayImg.addEventListener("load", () => {
  lastRenderedVideoTime = -1;
});

function setup(isServer) {
  serverMode = isServer;
  socket = io();

  socket.on("session_id", (data) => {
    mySessionId = data.session_id;
  });

  socket.on("draw", receiveDrawPoint);

  canvasMain = document.getElementById("canvas");
  ctxMain = canvasMain.getContext("2d", { alpha: false });
  canvasMain.style.touchAction = "none";
  Object.assign(document.documentElement.style, {
    width: "100%",
    height: "100%",
    background: "black",
  });
  Object.assign(document.body.style, {
    width: "100%",
    height: "100%",
    background: "black",
    display: "grid",
    placeItems: "center",
  });
  Object.assign(canvasMain.style, {
    position: "static",
    width: "auto",
    height: "auto",
    maxWidth: "100vw",
    maxHeight: "100vh",
    background: "black",
  });

  canvasMask = document.createElement("canvas");
  ctxMask = canvasMask.getContext("2d");
  canvasSharp = document.createElement("canvas");
  ctxSharp = canvasSharp.getContext("2d", { alpha: false });
  canvasBlur = document.createElement("canvas");
  ctxBlur = canvasBlur.getContext("2d", { alpha: false });
  canvasBlurSource = document.createElement("canvas");
  ctxBlurSource = canvasBlurSource.getContext("2d", { alpha: false });
  canvasFog = document.createElement("canvas");
  ctxFog = canvasFog.getContext("2d", { alpha: false });
  canvasMasked = document.createElement("canvas");
  ctxMasked = canvasMasked.getContext("2d");

  video.src = "/static/video.mp4";
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("loop", "");

  video.addEventListener("loadedmetadata", initApp, { once: true });
  video.addEventListener("canplay", initApp, { once: true });
  video.load();

  if (video.readyState >= 1) {
    initApp();
  }
}

function initApp() {
  if (started || !video.videoWidth || !video.videoHeight) return;
  started = true;

  const width = video.videoWidth;
  const height = video.videoHeight;
  const blurScale = effect.blurRenderScale;

  for (const canvas of [canvasMain, canvasMask, canvasSharp, canvasFog, canvasMasked]) {
    canvas.width = width;
    canvas.height = height;
  }

  blurFrameWidth = Math.max(1, Math.round(width * blurScale));
  blurFrameHeight = Math.max(1, Math.round(height * blurScale));
  blurPadding = Math.ceil(effect.blurStrength * blurScale * 2.5);

  canvasBlur.width = blurFrameWidth + blurPadding * 2;
  canvasBlur.height = blurFrameHeight + blurPadding * 2;
  canvasBlurSource.width = canvasBlur.width;
  canvasBlurSource.height = canvasBlur.height;

  if (serverMode) {
    updateCursor(effect.revealRadius);
    canvasMain.addEventListener("pointerdown", beginStroke);
    canvasMain.addEventListener("pointermove", continueStroke);
    canvasMain.addEventListener("pointerup", endStroke);
    canvasMain.addEventListener("pointercancel", endStroke);
  }

  const resumeVideo = () => {
    if (video.paused) video.play().catch(() => {});
  };
  window.addEventListener("pointerdown", resumeVideo, { once: true });
  video.play().catch(() => {});

  requestAnimationFrame(animate);
}

function beginStroke(event) {
  if (!serverMode || isDrawing) return;

  isDrawing = true;
  activePointerId = event.pointerId;
  currentStroke = [];
  canvasMain.setPointerCapture?.(event.pointerId);
  addLocalPoint(event);
}

function continueStroke(event) {
  if (!isDrawing || event.pointerId !== activePointerId) return;
  addLocalPoint(event);
}

function endStroke(event) {
  if (!isDrawing || event.pointerId !== activePointerId) return;

  addLocalPoint(event);
  isDrawing = false;
  activePointerId = null;

  if (currentStroke.length > 0) {
    revealStrokes.push({ sessionId: mySessionId, points: currentStroke });
  }

  // Die bisherige Version zeichnete fertige Striche versehentlich doppelt.
  // Die dadurch angenehm langsam startende Rückkehr des Beschlags bildet die
  // Fade-Kurve nun gezielt ab, ohne jeden Strich zweimal rendern zu müssen.
  currentStroke = [];
}

function addLocalPoint(event) {
  const point = eventToCanvasPoint(event);
  const previous = currentStroke[currentStroke.length - 1];

  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 1) {
    return;
  }

  currentStroke.push(point);
  socket.emit("draw", {
    x: point.x,
    y: point.y,
    new: currentStroke.length === 1,
  });
}

function eventToCanvasPoint(event) {
  const rect = canvasMain.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvasMain.width / rect.width),
    y: (event.clientY - rect.top) * (canvasMain.height / rect.height),
    time: Date.now(),
  };
}

function receiveDrawPoint(data) {
  if (data.new) {
    revealStrokes.push({ sessionId: data.session_id, points: [] });
  }

  let stroke = null;
  for (let i = revealStrokes.length - 1; i >= 0; i--) {
    if (revealStrokes[i].sessionId === data.session_id) {
      stroke = revealStrokes[i];
      break;
    }
  }

  if (!stroke) {
    stroke = { sessionId: data.session_id, points: [] };
    revealStrokes.push(stroke);
  }

  stroke.points.push({ x: data.x, y: data.y, time: Date.now() });
}

function animate() {
  const now = Date.now();

  renderVideoFrames();
  renderRevealMask(now);

  ctxMain.globalCompositeOperation = "source-over";
  ctxMain.globalAlpha = 1;
  ctxMain.drawImage(canvasFog, 0, 0);

  ctxMasked.clearRect(0, 0, canvasMasked.width, canvasMasked.height);
  ctxMasked.globalCompositeOperation = "source-over";
  ctxMasked.drawImage(canvasSharp, 0, 0);
  ctxMasked.globalCompositeOperation = "destination-in";
  ctxMasked.drawImage(canvasMask, 0, 0);

  ctxMain.drawImage(canvasMasked, 0, 0);
  requestAnimationFrame(animate);
}

function renderVideoFrames() {
  if (video.readyState < 2 || video.currentTime === lastRenderedVideoTime) return;
  lastRenderedVideoTime = video.currentTime;

  drawCover(ctxSharp, video, canvasSharp.width, canvasSharp.height);

  const scaledBlur = effect.blurStrength * effect.blurRenderScale;

  // Eine gepolsterte Quelle verhindert dunkle Blur-Ränder, ohne das Video
  // zu vergrößern. Der mittlere Ausschnitt bleibt deckungsgleich zum
  // scharfen Frame; nur die äußersten Pixel werden in den Rand verlängert.
  renderPaddedBlurSource();

  ctxBlur.save();
  ctxBlur.clearRect(0, 0, canvasBlur.width, canvasBlur.height);
  ctxBlur.filter = `blur(${scaledBlur}px) saturate(0.78) brightness(1.04)`;
  ctxBlur.drawImage(canvasBlurSource, 0, 0);
  ctxBlur.restore();

  ctxFog.save();
  ctxFog.globalCompositeOperation = "source-over";
  ctxFog.globalAlpha = 1;
  ctxFog.imageSmoothingEnabled = true;
  ctxFog.imageSmoothingQuality = "high";
  ctxFog.drawImage(
    canvasBlur,
    blurPadding,
    blurPadding,
    blurFrameWidth,
    blurFrameHeight,
    0,
    0,
    canvasFog.width,
    canvasFog.height,
  );

  if (fogOverlayImg.complete && fogOverlayImg.naturalWidth > 0) {
    ctxFog.globalCompositeOperation = "soft-light";
    ctxFog.globalAlpha = effect.fogTextureOpacity;
    drawCover(ctxFog, fogOverlayImg, canvasFog.width, canvasFog.height);
  }

  ctxFog.globalCompositeOperation = "source-over";
  ctxFog.globalAlpha = 1;
  ctxFog.fillStyle = effect.fogTint;
  ctxFog.fillRect(0, 0, canvasFog.width, canvasFog.height);
  ctxFog.restore();
}

function renderPaddedBlurSource() {
  const p = blurPadding;
  const w = blurFrameWidth;
  const h = blurFrameHeight;
  const sourceWidth = canvasSharp.width;
  const sourceHeight = canvasSharp.height;

  ctxBlurSource.clearRect(0, 0, canvasBlurSource.width, canvasBlurSource.height);

  // Exakter, unvergrößerter Videoframe in der Mitte.
  ctxBlurSource.drawImage(canvasSharp, 0, 0, sourceWidth, sourceHeight, p, p, w, h);

  if (p === 0) return;

  // Außenkanten verlängern, damit der Filter außerhalb des Bildes echte
  // Farbwerte vorfindet und keine dunklen oder transparenten Säume erzeugt.
  ctxBlurSource.drawImage(canvasSharp, 0, 0, 1, sourceHeight, 0, p, p, h);
  ctxBlurSource.drawImage(canvasSharp, sourceWidth - 1, 0, 1, sourceHeight, p + w, p, p, h);
  ctxBlurSource.drawImage(canvasSharp, 0, 0, sourceWidth, 1, p, 0, w, p);
  ctxBlurSource.drawImage(canvasSharp, 0, sourceHeight - 1, sourceWidth, 1, p, p + h, w, p);

  ctxBlurSource.drawImage(canvasSharp, 0, 0, 1, 1, 0, 0, p, p);
  ctxBlurSource.drawImage(canvasSharp, sourceWidth - 1, 0, 1, 1, p + w, 0, p, p);
  ctxBlurSource.drawImage(canvasSharp, 0, sourceHeight - 1, 1, 1, 0, p + h, p, p);
  ctxBlurSource.drawImage(
    canvasSharp,
    sourceWidth - 1,
    sourceHeight - 1,
    1,
    1,
    p + w,
    p + h,
    p,
    p,
  );
}

function renderRevealMask(now) {
  ctxMask.clearRect(0, 0, canvasMask.width, canvasMask.height);

  for (let i = revealStrokes.length - 1; i >= 0; i--) {
    renderStroke(revealStrokes[i].points, now, true);
    if (revealStrokes[i].points.length === 0) {
      revealStrokes.splice(i, 1);
    }
  }

  if (serverMode && currentStroke.length > 0) {
    renderStroke(currentStroke, now, false);
  }
}

function renderStroke(points, now, removeExpired) {
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    const next = points[i + 1];
    const opacity = revealOpacity(now - point.time);

    if (opacity <= 0) {
      if (removeExpired) points.splice(i, 1);
      continue;
    }

    ctxMask.save();
    ctxMask.globalAlpha = opacity;
    ctxMask.fillStyle = "white";
    ctxMask.strokeStyle = "white";
    ctxMask.lineWidth = effect.revealRadius * 2;
    ctxMask.lineCap = "round";
    ctxMask.lineJoin = "round";
    ctxMask.shadowColor = "white";
    ctxMask.shadowBlur = effect.revealEdgeSoftness;

    if (next && Math.hypot(next.x - point.x, next.y - point.y) <= effect.maxConnectionDistance) {
      ctxMask.beginPath();
      ctxMask.moveTo(next.x, next.y);
      ctxMask.lineTo(point.x, point.y);
      ctxMask.stroke();
    } else {
      ctxMask.beginPath();
      ctxMask.arc(point.x, point.y, effect.revealRadius, 0, Math.PI * 2);
      ctxMask.fill();
    }

    ctxMask.restore();
  }
}

function revealOpacity(elapsed) {
  if (elapsed <= effect.revealDuration) return 1;

  const progress = Math.min(
    1,
    (elapsed - effect.revealDuration) / effect.fadeDuration,
  );

  return 1 - progress * progress;
}

function drawCover(context, media, width, height) {
  const sourceWidth = media.videoWidth || media.naturalWidth || media.width;
  const sourceHeight = media.videoHeight || media.naturalHeight || media.height;
  if (!sourceWidth || !sourceHeight) return;

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  context.drawImage(media, sx, sy, sw, sh, 0, 0, width, height);
}

function updateCursor(radius) {
  const size = radius * 2 + 8;
  const cursorCanvas = document.createElement("canvas");
  cursorCanvas.width = size;
  cursorCanvas.height = size;

  const context = cursorCanvas.getContext("2d");
  context.strokeStyle = "rgba(255, 255, 255, 0.9)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  context.stroke();

  const dataUrl = cursorCanvas.toDataURL("image/png");
  canvasMain.style.cursor = `url(${dataUrl}) ${size / 2} ${size / 2}, auto`;
}
