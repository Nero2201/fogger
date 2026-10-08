// main.js – mit Stroke-Trennung, Fade-Out, Interpolation, Live-Vorschau & Touch-Unterstützung

let socket;
let canvasMain, ctxMain;
let canvasMask, ctxMask;
let canvasMasked, ctxMasked;
let blurredImg = new Image();
let bgVideo = document.createElement("video");
let isDrawing = false;
let currentStroke = [];
let revealStrokes = [];
let mySessionId = null; // Eigene Session-ID

const revealDuration = 0; // Sichtbarzeit in ms
const fadeDuration = 3000;   // Ausblendzeit in ms
const revealRadius = 20;
const maxConnectionDistance = 50; // Maximale Distanz für Linienverbindung
let serverMode = false;

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

    canvasMasked = document.createElement("canvas");
    ctxMasked = canvasMasked.getContext("2d");

    // Video-Setup
    bgVideo.src = "/static/video.mp4";
    bgVideo.autoplay = true;
    bgVideo.loop = true;
    bgVideo.muted = true;
    bgVideo.playsInline = true;
    bgVideo.setAttribute("playsinline", "");
    bgVideo.setAttribute("muted", "");
    bgVideo.setAttribute("autoplay", "");
    bgVideo.setAttribute("loop", "");

    blurredImg.src = "/static/image_blur.png";

    let imgLoaded = false;
    let videoLoaded = false;
    let started = false;

    function tryStart() {
        if (imgLoaded && videoLoaded && !started) {
            started = true;
            canvasMain.width = blurredImg.width;
            canvasMain.height = blurredImg.height;
            canvasMask.width = blurredImg.width;
            canvasMask.height = blurredImg.height;
            canvasMasked.width = blurredImg.width;
            canvasMasked.height = blurredImg.height;

            bgVideo.play().catch(err => {
                console.log("Autoplay-Hinweis:", err);
            });

            // Sicherstellen, dass das Video bei der ersten Interaktion startet, falls Autoplay blockiert wird
            const resumeVideo = () => {
                if (bgVideo.paused) {
                    bgVideo.play();
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
    }

    blurredImg.onload = () => {
        imgLoaded = true;
        tryStart();
    };

    bgVideo.onloadeddata = () => {
        videoLoaded = true;
        tryStart();
    };

    // Falls Video aus dem Cache schon bereit ist
    if (bgVideo.readyState >= 2) {
        videoLoaded = true;
        tryStart();
    }
}

function handleDraw(e) {
    if (!isDrawing) return;
    const rect = canvasMain.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = Date.now();

    currentStroke.push({ x, y, time });
    socket.emit("draw", { x, y, new: currentStroke.length === 1, session_id: mySessionId });
}

function handleTouchDraw(e) {
    if (!isDrawing) return;
    const touch = e.touches[0];
    const rect = canvasMain.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
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

    // Maske anwenden mit Hintergrund-Video
    ctxMasked.clearRect(0, 0, canvasMasked.width, canvasMasked.height);
    ctxMasked.globalCompositeOperation = "source-over";
    ctxMasked.drawImage(bgVideo, 0, 0, canvasMasked.width, canvasMasked.height);
    ctxMasked.globalCompositeOperation = "destination-in";
    ctxMasked.drawImage(canvasMask, 0, 0);

    // Finale Zusammenstellung auf dem Haupt-Canvas
    ctxMain.clearRect(0, 0, canvasMain.width, canvasMain.height);
    ctxMain.drawImage(blurredImg, 0, 0, canvasMain.width, canvasMain.height);
    ctxMain.drawImage(canvasMasked, 0, 0);

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