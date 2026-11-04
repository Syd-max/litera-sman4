const MAX_BYTES = 200 * 1024;
const dateFormat = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function initializeSelfieCamera(root) {
  const modal = root.querySelector(".selfie-modal");
  const openButton = root.querySelector("[data-camera-open]");
  const useButton = root.querySelector("[data-camera-use]");
  const video = root.querySelector("video");
  const image = root.querySelector("img");
  const frame = root.querySelector(".selfie-camera__frame");
  const placeholder = root.querySelector(".selfie-camera__placeholder");
  const stamp = root.querySelector(".selfie-camera__stamp");
  const message = root.querySelector("[data-selfie-message]");
  const startButton = root.querySelector("[data-camera-start]");
  const captureButton = root.querySelector("[data-camera-capture]");
  let stream, timer, blob, capturedAt, imageUrl, acceptedPhoto, serverOffset = 0, starting = false, attempt = 0;
  const stop = () => { clearInterval(timer); stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; };
  const close = () => {
    attempt++; starting = false; stop();
    startButton.disabled = false; captureButton.disabled = false;
    modal.hidden = true; openButton.setAttribute("aria-expanded", "false"); openButton.focus();
  };
  const time = () => new Date(Date.now() + serverOffset);
  const paintTime = () => { const now = time(); stamp.textContent = `${dateFormat.format(now)} · ${timeFormat.format(now)} WIB`; };
  const fail = text => { message.hidden = false; message.textContent = text; message.setAttribute("role", "alert"); };
  openButton.addEventListener("click", () => {
    modal.hidden = false; openButton.setAttribute("aria-expanded", "true");
    captureButton.hidden = true; useButton.hidden = true;
    startButton.click();
    modal.querySelector("[data-camera-close]").focus();
  });
  modal.querySelector("[data-camera-close]").addEventListener("click", close);
  modal.addEventListener("click", event => { if (event.target === modal) close(); });
  modal.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const controls = [...modal.querySelectorAll("button")].filter(button => !button.hidden && !button.disabled);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }
  });
  useButton.addEventListener("click", () => {
    if (!blob) return;
    acceptedPhoto = { blob, capturedAt };
    openButton.dataset.ready = "true";
    openButton.setAttribute("aria-label", "Selfie Time, foto sudah dipilih");
    root.querySelector("[data-selfie-selected]").hidden = false;
    root.dispatchEvent(new Event("selfie-ready"));
    close();
  });

  startButton.addEventListener("click", async () => {
    if (starting) return;
    if (!navigator.mediaDevices?.getUserMedia) { fail("Kamera tidak tersedia. Buka LITERA melalui browser yang mendukung kamera dan koneksi HTTPS."); return; }
    starting = true; startButton.disabled = true; message.hidden = false; message.textContent = "Membuka kamera...";
    const currentAttempt = ++attempt;
    let openedStream;
    stop();
    try {
      openedStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false });
      if (currentAttempt !== attempt || modal.hidden) { openedStream.getTracks().forEach(track => track.stop()); return; }
      stream = openedStream;
      const response = await fetch("/api/registration-selfie", { cache: "no-store" });
      if (!response.ok) throw new Error("SERVER_TIME");
      const data = await response.json();
      if (!Number.isFinite(Date.parse(data.serverTime))) throw new Error("SERVER_TIME");
      if (currentAttempt !== attempt || modal.hidden) { openedStream.getTracks().forEach(track => track.stop()); return; }
      serverOffset = Date.parse(data.serverTime) - Date.now();
      video.srcObject = stream;
      await video.play();
      if (currentAttempt !== attempt || modal.hidden) { openedStream.getTracks().forEach(track => track.stop()); return; }
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      blob = null; capturedAt = null; imageUrl = null;
      video.hidden = false; image.hidden = true; placeholder.hidden = true; stamp.hidden = false;
      frame.hidden = false; captureButton.hidden = false; useButton.hidden = true;
      startButton.textContent = "Buka Ulang Kamera";
      paintTime(); timer = setInterval(paintTime, 1000);
      message.removeAttribute("role"); message.textContent = ""; message.hidden = true;
    } catch (error) {
      if (currentAttempt !== attempt) { openedStream?.getTracks().forEach(track => track.stop()); return; }
      stop(); captureButton.hidden = true;
      fail(error.name === "NotAllowedError" ? "Izin kamera ditolak. Izinkan kamera pada pengaturan situs browser, lalu coba lagi." : error.name === "NotFoundError" ? "Kamera tidak ditemukan pada perangkat ini." : "Kamera belum dapat dibuka. Periksa kamera dan koneksi, lalu coba lagi.");
    } finally { if (currentAttempt === attempt) { starting = false; startButton.disabled = false; } }
  });

  captureButton.addEventListener("click", async () => {
    if (!stream || !video.videoWidth || !video.videoHeight) return;
    captureButton.disabled = true;
    const currentAttempt = attempt;
    const snapshot = document.createElement("canvas");
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    snapshot.width = Math.round(video.videoWidth * scale); snapshot.height = Math.round(video.videoHeight * scale);
    const context = snapshot.getContext("2d");
    context.drawImage(video, 0, 0, snapshot.width, snapshot.height);
    const now = time();
    const fontSize = Math.max(16, Math.round(snapshot.width * .045));
    const band = fontSize * 3.6;
    context.fillStyle = "rgba(16,43,104,.88)"; context.fillRect(0, snapshot.height - band, snapshot.width, band);
    context.fillStyle = "#fff"; context.font = `600 ${fontSize}px Arial`;
    context.fillText(dateFormat.format(now), fontSize, snapshot.height - band + fontSize * 1.4, snapshot.width - fontSize * 2);
    context.fillText(`${timeFormat.format(now)} WIB`, fontSize, snapshot.height - fontSize * .7, snapshot.width - fontSize * 2);
    stop();
    try {
      let output;
      for (const quality of [.82, .70, .58, .46]) {
        output = await new Promise(resolve => snapshot.toBlob(resolve, "image/webp", quality));
        if (!output || output.type !== "image/webp") throw new Error("WEBP_UNSUPPORTED");
        if (output.size <= MAX_BYTES) break;
      }
      if (output.size > MAX_BYTES) throw new Error("PHOTO_TOO_LARGE");
      if (currentAttempt !== attempt || modal.hidden) return;
      blob = output; capturedAt = now.toISOString();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(blob); image.src = imageUrl;
      image.hidden = false; video.hidden = true; stamp.hidden = true; captureButton.hidden = true; useButton.hidden = false;
      startButton.textContent = "Ambil Ulang";
      message.removeAttribute("role"); message.textContent = ""; message.hidden = true;
    } catch { if (currentAttempt === attempt) { blob = null; capturedAt = null; fail("Foto belum dapat dikompres. Buka kamera dan ambil ulang foto."); } }
    finally { if (currentAttempt === attempt) captureButton.disabled = false; }
  });
  window.addEventListener("pagehide", event => {
    attempt++; stop(); modal.hidden = true; openButton.setAttribute("aria-expanded", "false"); captureButton.hidden = true; video.hidden = true; stamp.hidden = true;
    if (!blob) placeholder.hidden = false;
    if (imageUrl && !event.persisted) URL.revokeObjectURL(imageUrl);
  });
  return { photo: () => acceptedPhoto || null, stop };
}
