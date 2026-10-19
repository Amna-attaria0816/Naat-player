// ---------- Playlist ----------
// The playlist starts empty: use "Add naats from your device" in the page.
// Optional: to preload files from an `audio/` folder next to this page, add entries like:
//   { title: "Title of the naat", reciter: "Reciter name", file: "audio/my-naat.mp3" }
const tracks = [];

// ---------- Elements ----------
const $ = id => document.getElementById(id);
const audio = $("audio"), player = $("player");
const seek = $("seek"), volume = $("volume"), volBox = document.querySelector(".volume");
const list = $("list");

let index = -1;
let seeking = false;
let lastVolume = 0.8;

// ---------- Helpers ----------
const fmt = s => {
  if (!isFinite(s)) return "–:––";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};
const fill = input => input.style.setProperty("--p", (input.value / input.max) * 100 + "%");
const setStatus = msg => { $("status").textContent = msg; };
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- Playlist ----------
function addToList(t, i) {
  const li = document.createElement("li");
  li.innerHTML = `
    <button class="item" data-i="${i}">
      <span class="num">${i + 1}</span>
      <span><span class="name">${esc(t.title)}</span><span class="by">${esc(t.reciter)}</span></span>
      <span class="len">–:––</span>
    </button>`;
  list.appendChild(li);
  $("empty").hidden = true;

  // read each file's length without playing it
  const probe = new Audio();
  probe.preload = "metadata";
  probe.src = t.file;
  probe.addEventListener("loadedmetadata", () => {
    t.duration = probe.duration;
    li.querySelector(".len").textContent = fmt(probe.duration);
    if (tracks[index] === t) $("dur").textContent = fmt(t.duration);
  });
}
tracks.forEach(addToList);

list.addEventListener("click", e => {
  const btn = e.target.closest(".item");
  if (!btn) return;
  const i = +btn.dataset.i;
  if (i === index) togglePlay(); else load(i, true);
});

// ---------- Add files from the device ----------
$("addBtn").addEventListener("click", () => $("files").click());
$("files").addEventListener("change", e => {
  const files = [...e.target.files];
  if (!files.length) return;
  const firstNew = tracks.length;
  files.forEach(f => {
    // "Title - Reciter.mp3" is split automatically; otherwise the whole name is the title
    const name = f.name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
    const [title, reciter] = name.includes(" - ") ? name.split(/ - (.+)/) : [name, "Reciter not set"];
    const t = { title: title.trim(), reciter: (reciter || "Reciter not set").trim(), file: URL.createObjectURL(f) };
    tracks.push(t);
    addToList(t, tracks.length - 1);
  });
  load(firstNew, true);   // start with the first file you added
  e.target.value = "";
});

// ---------- Load a naat ----------
function load(i, autoplay = false) {
  if (!tracks.length) return;
  index = (i + tracks.length) % tracks.length;
  const t = tracks[index];

  audio.src = t.file;
  $("title").textContent = t.title;
  $("artist").textContent = t.reciter;
  $("cur").textContent = "0:00";
  $("dur").textContent = fmt(t.duration);
  seek.value = 0; fill(seek);
  setStatus("");

  list.querySelectorAll(".item").forEach((el, n) => el.classList.toggle("current", n === index));
  document.title = `${t.title} – Naat Player`;

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.reciter });
  }
  if (autoplay) play();
}

// ---------- Play / pause / next / previous ----------
function play() {
  const p = audio.play();
  if (p) p.catch(() => {});   // load problems are reported by the "error" event
}
function togglePlay() {
  if (!tracks.length) return $("files").click();   // nothing added yet: open the file picker
  if (index < 0) return load(0, true);
  audio.paused ? play() : audio.pause();
}
function prev() {
  if (!tracks.length) return;
  if (audio.currentTime > 3) audio.currentTime = 0;   // restart if it has played a few seconds
  else load(index - 1, !audio.paused);
}

$("play").addEventListener("click", togglePlay);
$("next").addEventListener("click", () => load(index + 1, true));
$("prev").addEventListener("click", prev);

audio.addEventListener("play", () => {
  player.classList.add("playing");
  $("play").setAttribute("aria-label", "Pause");
});
audio.addEventListener("pause", () => {
  player.classList.remove("playing");
  $("play").setAttribute("aria-label", "Play");
});

// ---------- Duration + progress bar ----------
audio.addEventListener("loadedmetadata", () => {
  if (tracks[index]) tracks[index].duration = audio.duration;
  $("dur").textContent = fmt(audio.duration);
  setStatus("");
});
audio.addEventListener("timeupdate", () => {
  if (seeking || !audio.duration) return;
  seek.value = (audio.currentTime / audio.duration) * 1000;
  fill(seek);
  $("cur").textContent = fmt(audio.currentTime);
});
seek.addEventListener("input", () => {
  seeking = true;
  fill(seek);
  if (audio.duration) $("cur").textContent = fmt((seek.value / 1000) * audio.duration);
});
seek.addEventListener("change", () => {
  if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
  seeking = false;
});

// ---------- Autoplay ----------
audio.addEventListener("ended", () => {
  if ($("autoplay").checked) {
    load(index + 1, true);
  } else {
    audio.currentTime = 0;
    seek.value = 0; fill(seek);
  }
});

audio.addEventListener("error", () => {
  if (index < 0) return;
  player.classList.remove("playing");
  setStatus("This file could not be played. Try another audio file.");
});

// ---------- Volume ----------
function setVolume(v) {
  audio.volume = v;
  volume.value = v * 100;
  fill(volume);
  volBox.classList.toggle("muted", v === 0);
  try { localStorage.setItem("naat-volume", v); } catch (e) {}
}
volume.addEventListener("input", () => {
  const v = volume.value / 100;
  if (v > 0) lastVolume = v;
  setVolume(v);
});
$("mute").addEventListener("click", () => setVolume(audio.volume === 0 ? lastVolume : 0));

// ---------- Keyboard + lock-screen controls ----------
document.addEventListener("keydown", e => {
  if (e.target.matches("button, input")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.key === "n" || e.key === "N") $("next").click();
  if (e.key === "p" || e.key === "P") prev();
});
if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", play);
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("nexttrack", () => load(index + 1, true));
  navigator.mediaSession.setActionHandler("previoustrack", prev);
}

// ---------- Start ----------
let saved = 0.8;
try { saved = parseFloat(localStorage.getItem("naat-volume")) || 0.8; } catch (e) {}
lastVolume = saved;
setVolume(saved);
fill(seek);
if (tracks.length) load(0);