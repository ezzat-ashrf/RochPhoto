const FIREBASE_ROOT = "https://photo-game-2f638-default-rtdb.firebaseio.com";
const QR_API_URL = "https://optima-software-solutions.com/sts/stsimageqr/api.php";
const QR_API_BASE_URL = "https://optima-software-solutions.com/sts/stsimageqr/";
const welcomeScreen = document.querySelector("#welcomeScreen");
const startButton = document.querySelector("#startButton");
const registrationPage = document.querySelector("#registrationPage");
const form = document.querySelector("#registrationForm");
const photoInput = document.querySelector("#photoInput");
const photoPreview = document.querySelector("#photoPreview");
const photoPrompt = document.querySelector("#photoPrompt");
const messageInput = document.querySelector("#messageInput");
const messageCount = document.querySelector("#messageCount");
const submitButton = document.querySelector("#submitButton");
const status = document.querySelector("#status");
const resultPage = document.querySelector("#resultPage");
const resultCard = document.querySelector("#resultCard");
const resultQr = document.querySelector("#resultQr");
const finishButton = document.querySelector("#finishButton");

let selectedFile = null;
let previewUrl = null;
let resultCardUrl = null;

messageInput.addEventListener("input", () => {
  messageCount.textContent = messageInput.value.length;
  setStatus("");
});

startButton.addEventListener("click", () => {
  registrationPage.setAttribute("aria-hidden", "false");
  welcomeScreen.classList.add("is-leaving");
  window.setTimeout(() => {
    welcomeScreen.hidden = true;
    document.querySelector(".photo-picker")?.focus();
  }, 550);
});

function showWelcomeScreen() {
  window.scrollTo({ top: 0, behavior: "auto" });
  registrationPage.setAttribute("aria-hidden", "true");
  resultPage.hidden = true;
  resultPage.setAttribute("aria-hidden", "true");
  resultQr.removeAttribute("src");
  resultCard.removeAttribute("src");
  if (resultCardUrl) {
    URL.revokeObjectURL(resultCardUrl);
    resultCardUrl = null;
  }
  welcomeScreen.hidden = false;
  requestAnimationFrame(() => {
    welcomeScreen.classList.remove("is-leaving");
    startButton.focus({ preventScroll: true });
  });
}

finishButton.addEventListener("click", showWelcomeScreen);

photoInput.addEventListener("change", () => {
  selectedFile = photoInput.files?.[0] ?? null;
  if (!selectedFile) return;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(selectedFile);
  photoPreview.src = previewUrl;
  photoPreview.style.display = "block";
  photoPrompt.style.display = "none";
  setStatus("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedFile) {
    setStatus("Please add a photo.", "error");
    return;
  }

  const message = messageInput.value.trim();
  if (!message) {
    setStatus("Please add your message.", "error");
    messageInput.focus();
    return;
  }

  submitButton.disabled = true;
  setStatus("Preparing your photo…");
  try {
    const cardBlob = await createPhotoCard(selectedFile, message);
    const imageBase64 = await blobToDataUrl(cardBlob);
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    // Firebase receives the completed PNG card—not the original camera image.
    const submission = {
      id,
      imageBase64,
      message,
      isCard: true,
      cardWidth: 1080,
      cardHeight: 1080,
      cardAspectRatio: "1:1",
      createdAt: Date.now()
    };

    setStatus("Sending to the big screen…");
    const historyResponse = await fetch(`${FIREBASE_ROOT}/submissions/${id}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission)
    });
    if (!historyResponse.ok) throw new Error(`Firebase rejected the submission (${historyResponse.status}).`);

    const latestResponse = await fetch(`${FIREBASE_ROOT}/latest.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission)
    });
    if (!latestResponse.ok) throw new Error(`Firebase could not notify the viewer (${latestResponse.status}).`);

    setStatus("Creating your QR code…");
    const qrUrl = await uploadCardForQr(cardBlob);
    await preloadImage(qrUrl);

    if (resultCardUrl) URL.revokeObjectURL(resultCardUrl);
    resultCardUrl = URL.createObjectURL(cardBlob);
    resultCard.src = resultCardUrl;
    resultQr.src = qrUrl;

    registrationPage.setAttribute("aria-hidden", "true");
    resultPage.hidden = false;
    resultPage.setAttribute("aria-hidden", "false");
    window.scrollTo({ top: 0, behavior: "auto" });

    form.reset();
    selectedFile = null;
    photoPreview.removeAttribute("src");
    photoPreview.style.display = "none";
    photoPrompt.style.display = "block";
    messageCount.textContent = "0";
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not send your photo. Please try again.", "error");
  } finally {
    submitButton.disabled = false;
  }
});

function setStatus(text, type = "") {
  status.textContent = text;
  status.className = `status ${type}`.trim();
}

async function uploadCardForQr(cardBlob) {
  if (!cardBlob || cardBlob.size === 0) throw new Error("The photo card could not be created.");

  const body = new FormData();
  body.append("image", cardBlob, "generated_result.png");
  const response = await fetch(QR_API_URL, { method: "POST", body });
  const responseText = await response.text();
  if (!response.ok) {
    console.error("QR upload failed", response.status, responseText);
    throw new Error("Could not create the QR code. Please try again.");
  }

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    console.error("Invalid QR API JSON", error, responseText);
    throw new Error("The QR service returned an invalid response.");
  }

  if (!payload?.success) {
    console.error("QR API returned success=false", payload);
    throw new Error(payload?.message || payload?.error || "The QR service could not save your image.");
  }

  const rawUrl = payload.qr_code_url || payload.data?.qr_code_url;
  if (!rawUrl) {
    console.error("QR API response is missing qr_code_url", payload);
    throw new Error("The QR service did not return a QR code.");
  }
  return new URL(rawUrl, QR_API_BASE_URL).href;
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => {
      console.error("QR image download failed", url);
      reject(new Error("The QR code could not be downloaded."));
    };
    image.src = url;
  });
}

async function createPhotoCard(file, message) {
  const photoDataUrl = await readFileAsDataUrl(file);
  const [photo, cardTemplate] = await Promise.all([
    loadImage(photoDataUrl),
    loadImage(CARD_TEMPLATE_DATA_URL)
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not create the photo card.");

  context.drawImage(cardTemplate, 0, 0, canvas.width, canvas.height);

  // Exact photo opening from the supplied 600 x 600 Illustrator artwork.
  drawCover(context, photo, 90, 209, 900, 665);

  // Remove the sample name from the artwork while keeping its purple footer.
  const footerGradient = context.createLinearGradient(0, 890, canvas.width, 1035);
  footerGradient.addColorStop(0, "#2c225c");
  footerGradient.addColorStop(0.5, "#5d4d98");
  footerGradient.addColorStop(1, "#211946");
  context.fillStyle = footerGradient;
  context.fillRect(120, 900, 840, 125);

  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 50px Arial, sans-serif";
  drawWrappedText(context, message, 540, 962, 820, 56, 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed.")), "image/png");
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The completed card could not be prepared for the wall."));
    reader.readAsDataURL(blob);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The selected photo could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(url, revokeAfterLoad = false) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (revokeAfterLoad) URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      if (revokeAfterLoad) URL.revokeObjectURL(url);
      reject(new Error("An image needed for the card could not be opened."));
    };
    image.src = url;
  });
}

function drawCover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const visibleLines = lines.slice(0, maxLines);
  const startY = y - ((visibleLines.length - 1) * lineHeight) / 2;
  visibleLines.forEach((value, index) => context.fillText(value, x, startY + index * lineHeight, maxWidth));
}

function resizeImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const sourceUrl = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(sourceUrl);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("The selected image could not be opened."));
    };
    image.src = sourceUrl;
  });
}
