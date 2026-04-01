const API_KEY = "AIzaSyDVQIfdvxY-v86N1iCQ2c3dhCsOk-A5fLw";
const CHANNEL_ID = "UCSPkWjU1D1CkEYNQo1WX8sA";


// Elementos del DOM (los que ya tienes en tu HTML)
const featuredContainer = document.getElementById("featuredSermon");
const gridContainer = document.getElementById("sermonsGrid");
const statusText = document.getElementById("sermonsStatus");
const moreBtn = document.getElementById("sermonsMoreBtn");

// Obtener uploads playlist
async function getUploadsPlaylist() {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`;
  
  const res = await fetch(url);
  const data = await res.json();

  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

// Obtener videos
async function loadSermons() {
  try {
    const playlistId = await getUploadsPlaylist();

    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=5&key=${API_KEY}`;
    
    const res = await fetch(url);
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      statusText.textContent = "No se encontraron videos.";
      return;
    }

    displayVideos(data.items);
    statusText.style.display = "none";

    // Botón "ver más"
    moreBtn.href = `https://www.youtube.com/channel/${CHANNEL_ID}/videos`;

  } catch (error) {
    console.error(error);
    statusText.textContent = "Error al cargar los videos.";
  }
}

// Mostrar videos
function displayVideos(videos) {
  featuredContainer.innerHTML = "";
  gridContainer.innerHTML = "";

  // 🎯 PRIMER VIDEO (DESTACADO)
  const firstVideo = videos[0];
  const firstId = firstVideo.snippet.resourceId.videoId;

  featuredContainer.innerHTML = `
    <iframe 
      src="https://www.youtube.com/embed/${firstId}" 
      frameborder="0" 
      allowfullscreen
      width="100%" 
      height="400">
    </iframe>
  `;

  // 🎯 LOS OTROS 4 VIDEOS
  videos.slice(1, 4).forEach(video => {
    const videoId = video.snippet.resourceId.videoId;
    const title = video.snippet.title;
    const thumbnail = video.snippet.thumbnails.medium.url;

    const card = document.createElement("div");
    card.classList.add("sermon-card");

    card.innerHTML = `
      <div class="sermon-card__thumb">
        <img src="${thumbnail}" alt="${title}">
      </div>
      <h4 class="sermon-card__title">${title}</h4>
    `;

    // 👉 click abre video en modal
    card.addEventListener("click", () => openVideoModal(videoId));

    gridContainer.appendChild(card);
  });
}

// 🎬 MODAL
function openVideoModal(videoId) {
  const modal = document.getElementById("videoModal");
  const frame = document.getElementById("videoModalFrame");

  frame.innerHTML = `
    <iframe 
      src="https://www.youtube.com/embed/${videoId}?autoplay=1" 
      frameborder="0" 
      allowfullscreen 
      width="100%" 
      height="400">
    </iframe>
  `;

  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
}

// cerrar modal
document.querySelectorAll("[data-modal-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    const modal = document.getElementById("videoModal");
    const frame = document.getElementById("videoModalFrame");

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    frame.innerHTML = "";
  });
});

// iniciar
loadSermons();
