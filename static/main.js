// main.js – mit Stroke-Trennung, Fade-Out, Interpolation, Live-Vorschau & Touch-Unterstützung

let socket;
let canvasMain, ctxMain;
let canvasMask, ctxMask;
let blurredImg = new Image();
let sharpImg = new Image();
let isDrawing = false;
let currentStroke = [];
let revealStrokes = [];

const revealDuration = 0; // Sichtbarzeit in ms
const fadeDuration = 3000;   // Ausblendzeit in ms
const revealRadius = 20;
let serverMode = false;

function setup(isServer) {
  serverMode = isServer;
  socket = io();

  canvasMain = document.getElementById("canvas");
  ctxMain = canvasMain.getContext("2d");

  canvasMask = document.createElement("canvas");
  ctxMask = canvasMask.getContext("2d");

  blurredImg.src = "/static/image_blur.png";
  sharpImg.src = "/static/image.png";

  blurredImg.onload = () => {
    sharpImg.onload = () => {
      canvasMain.width = blurredImg.width;
      canvasMain.height = blurredImg.height;
      canvasMask.width = blurredImg.width;
      canvasMask.height = blurredImg.height;

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
            revealStrokes.push(currentStroke);
          }
        });
        canvasMain.addEventListener("mouseleave", () => {
          isDrawing = false;
          if (currentStroke.length > 0) {
            revealStrokes.push(currentStroke);
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
            revealStrokes.push(currentStroke);
          }
        });

        canvasMain.addEventListener("touchcancel", () => {
          isDrawing = false;
          if (currentStroke.length > 0) {
            revealStrokes.push(currentStroke);
          }
        });

        socket.on("draw", data => {
          if (data.new) {
            revealStrokes.push([]);
          }
          const lastStroke = revealStrokes[revealStrokes.length - 1];
          if (lastStroke) {
            lastStroke.push({ x: data.x, y: data.y, time: Date.now() });
          }
        });
      } else {
        socket.on("draw", data => {
          if (data.new) {
            revealStrokes.push([]);
          }
          const lastStroke = revealStrokes[revealStrokes.length - 1];
          if (lastStroke) {
            lastStroke.push({ x: data.x, y: data.y, time: Date.now() });
          }
        });
      }

      requestAnimationFrame(animate);
    };
  };
}

function handleDraw(e) {
  if (!isDrawing) return;
  const rect = canvasMain.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const time = Date.now();

  currentStroke.push({ x, y, time });
  socket.emit("draw", { x, y, new: currentStroke.length === 1 });
}

function handleTouchDraw(e) {
  if (!isDrawing) return;
  const touch = e.touches[0];
  const rect = canvasMain.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  const time = Date.now();

  currentStroke.push({ x, y, time });
  socket.emit("draw", { x, y, new: currentStroke.length === 1 });
}

function animate() {
  const now = Date.now();
  ctxMask.clearRect(0, 0, canvasMask.width, canvasMask.height);

  // Bestehende Striche zeichnen
  for (let s = revealStrokes.length - 1; s >= 0; s--) {
    const stroke = revealStrokes[s];
    if (!stroke || stroke.length === 0) continue;

    for (let i = stroke.length - 1; i >= 0; i--) {
      const current = stroke[i];
      const next = stroke[i + 1];

      const elapsed = now - current.time;
      let alpha = 1.0;
      if (elapsed > revealDuration) {
        const fadeElapsed = elapsed - revealDuration;
        alpha = 1.0 - (fadeElapsed / fadeDuration);
        if (alpha <= 0) {
          stroke.splice(i, 1);
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
        ctxMask.beginPath();
        ctxMask.moveTo(next.x, next.y);
        ctxMask.lineTo(current.x, current.y);
        ctxMask.stroke();
      } else {
        ctxMask.beginPath();
        ctxMask.arc(current.x, current.y, revealRadius, 0, Math.PI * 2);
        ctxMask.fill();
      }
      ctxMask.restore();
    }

    if (stroke.length === 0) {
      revealStrokes.splice(s, 1);
    }
  }

  // Aktuelle Linie (Live-Zeichnung)
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
        ctxMask.beginPath();
        ctxMask.moveTo(next.x, next.y);
        ctxMask.lineTo(current.x, current.y);
        ctxMask.stroke();
      } else {
        ctxMask.beginPath();
        ctxMask.arc(current.x, current.y, revealRadius, 0, Math.PI * 2);
        ctxMask.fill();
      }
      ctxMask.restore();
    }
  }

  // Maske anwenden
  const maskedCanvas = document.createElement("canvas");
  maskedCanvas.width = sharpImg.width;
  maskedCanvas.height = sharpImg.height;
  const maskedCtx = maskedCanvas.getContext("2d");

  maskedCtx.drawImage(sharpImg, 0, 0);
  maskedCtx.globalCompositeOperation = "destination-in";
  maskedCtx.drawImage(canvasMask, 0, 0);

  ctxMain.clearRect(0, 0, canvasMain.width, canvasMain.height);
  ctxMain.drawImage(blurredImg, 0, 0);
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