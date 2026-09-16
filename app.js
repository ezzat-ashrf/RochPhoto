const FIREBASE_ROOT = "https://photo-game-2f638-default-rtdb.firebaseio.com";
const welcomeScreen = document.querySelector("#welcomeScreen");
const startButton = document.querySelector("#startButton");
const registrationPage = document.querySelector("#registrationPage");
const form = document.querySelector("#registrationForm");
const photoInput = document.querySelector("#photoInput");
const photoPreview = document.querySelector("#photoPreview");
const photoPrompt = document.querySelector("#photoPrompt");
const nameInput = document.querySelector("#nameInput");
const messageInput = document.querySelector("#messageInput");
const messageCount = document.querySelector("#messageCount");
const submitButton = document.querySelector("#submitButton");
const status = document.querySelector("#status");

let selectedFile = null;
let previewUrl = null;

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
  welcomeScreen.hidden = false;
  requestAnimationFrame(() => {
    welcomeScreen.classList.remove("is-leaving");
    startButton.focus({ preventScroll: true });
  });
}

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

messageInput.addEventListener("input", () => {
  messageCount.textContent = messageInput.value.length;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const personName = nameInput.value.trim();
  const message = messageInput.value.trim();
  if (!selectedFile || !personName || !message) {
    setStatus("Please add a photo, your name, and a message.", "error");
    return;
  }

  submitButton.disabled = true;
  setStatus("Preparing your photo…");
  try {
    const imageBase64 = await resizeImage(selectedFile, 900, 0.78);
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const submission = { id, name: personName, message, imageBase64, createdAt: Date.now() };

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

    setStatus("Sent! Look at the big screen ✨", "success");
    form.reset();
    selectedFile = null;
    messageCount.textContent = "0";
    photoPreview.removeAttribute("src");
    photoPreview.style.display = "none";
    photoPrompt.style.display = "block";
    window.setTimeout(showWelcomeScreen, 1200);
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
