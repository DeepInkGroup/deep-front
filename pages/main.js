const form = document.getElementById("server-form");
const input = document.getElementById("server-url");
const message = document.getElementById("form-message");
const button = document.getElementById("play-button");
const status = document.getElementById("server-status");

function gameUrl(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}
function showServer(url) {
  input.value = url;
  button.href = url;
  button.textContent = "Play Deep Front ↗";
  button.target = "_blank";
  button.rel = "noopener noreferrer";
  status.textContent = `Game server: ${new URL(url).hostname}`;
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const url = gameUrl(input.value);
  if (!url) {
    message.textContent =
      "Enter a full HTTPS URL, for example https://your-game.onrender.com.";
    message.classList.add("error");
    return;
  }
  try {
    localStorage.setItem("deep-front-server", url);
  } catch {}
  showServer(url);
  message.classList.remove("error");
  message.textContent = "Saved. Use Play Deep Front above to reopen your game.";
  window.open(url, "_blank", "noopener,noreferrer");
});

async function initialize() {
  let saved;
  try {
    saved = localStorage.getItem("deep-front-server");
  } catch {}
  const shared = new URLSearchParams(location.search).get("server");
  const selected = gameUrl(shared || "");
  if (selected) {
    showServer(selected);
    return;
  }
  try {
    const response = await fetch("./config.json", { cache: "no-cache" });
    if (response.ok) {
      const config = await response.json();
      const configured = gameUrl(config.serverUrl || "");
      if (configured) {
        showServer(configured);
        return;
      }
    }
  } catch {}
  const remembered = gameUrl(saved || "");
  if (remembered) showServer(remembered);
}
initialize();
