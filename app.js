// Firebase Configuration (from console.firebase.google.com)
const firebaseConfig = {
  apiKey: "AIzaSyAamurfqcomLg0VGyqe1G8mGbBRbZA7amw",
  authDomain: "gamevote-riskitv.firebaseapp.com",
  databaseURL: "https://gamevote-riskitv-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "gamevote-riskitv",
  storageBucket: "gamevote-riskitv.firebasestorage.app",
  messagingSenderId: "946213771525",
  appId: "1:946213771525:web:248e9094d6ca1ea2deff6c"
};

// Initialize Firebase using compat mode (avoids CORS issues on local file:// protocol)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Local Storage key for voter status (tracks which games this user has voted for)
const VOTED_KEY = 'riski_voted_games';

// Load base games from games_data.js and custom_games.js
const rawGames = window.IMPORTED_GAMES || [];
const customGames = window.CUSTOM_GAMES || [];

const baseGames = [
    ...rawGames.map(g => ({
        id: g.appid.toString(),
        title: g.name,
        image: g.image || `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${g.appid}/capsule_231x87.jpg`
    })),
    ...customGames.map(g => ({
        id: g.appid.toString(),
        title: g.name,
        image: g.image || `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${g.appid}/capsule_231x87.jpg`
    }))
];

// State variables
let games = baseGames.map(game => ({ ...game, votes: 0 }));
let votedGames = JSON.parse(localStorage.getItem(VOTED_KEY) || '{}');
let searchQuery = "";
let sortMode = "votes"; // 'votes', 'az', 'za'

// DOM Elements
const gameListEl = document.getElementById('game-list');
const loadingEl = document.getElementById('loading');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');

// Set up Search Input listener
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderGames();
    });
}

// Set up Sort Dropdown listener
if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
        sortMode = e.target.value;
        renderGames();
    });
}

// Render Games List in HTML
function renderGames() {
    gameListEl.innerHTML = '';

    if (games.length === 0) {
        loadingEl.innerHTML = 'Keine Spiele gefunden.<br>Bitte importiere deine Spiele.';
        loadingEl.classList.remove('hidden');
        loadingEl.style.animation = 'none';
        return;
    }

    // Sort games
    if (sortMode === 'votes') {
        games.sort((a, b) => b.votes - a.votes);
    } else if (sortMode === 'az') {
        games.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortMode === 'za') {
        games.sort((a, b) => b.title.localeCompare(a.title));
    }
    
    // Filter games by search query
    const filteredGames = games.filter(game => 
        game.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filteredGames.length === 0 && games.length > 0) {
        loadingEl.innerHTML = 'Keine Spiele gefunden, die deiner Suche entsprechen.';
        loadingEl.classList.remove('hidden');
        loadingEl.style.animation = 'none';
        return;
    }
    
    filteredGames.forEach((game, index) => {
        const isVoted = votedGames[game.id] === true;
        
        const li = document.createElement('li');
        li.className = 'game-item';
        
        // Add a slight animation delay for list items
        li.style.animationDelay = `${index * 0.05}s`;
        
        li.innerHTML = `
            <div class="rank">#${index + 1}</div>
            <img src="${game.image}" alt="${game.title}" class="game-image" onerror="this.onerror=null; this.src='https://placehold.co/231x87/150a21/a855f7?text=' + encodeURIComponent(this.alt);">
            <div class="game-info">
                <h2 class="game-title">${game.title}</h2>
            </div>
            <div class="vote-container">
                <span class="vote-count" id="count-${game.id}">${game.votes}</span>
                <button class="vote-btn ${isVoted ? 'voted' : ''}" onclick="toggleVote('${game.id}')" aria-label="Vote for ${game.title}">
                    <i class="fa-${isVoted ? 'solid' : 'regular'} fa-heart"></i>
                </button>
            </div>
        `;
        
        gameListEl.appendChild(li);
    });

    loadingEl.classList.add('hidden');
    gameListEl.classList.remove('hidden');
}

// Subscribe to Live Votes changes from Firebase Realtime Database
const votesRef = db.ref('votes');
votesRef.on('value', (snapshot) => {
    const data = snapshot.val() || {};
    
    // Map votes from Firebase back to our base games array
    games = baseGames.map(game => ({
        ...game,
        votes: data[game.id] || 0
    }));

    renderGames();
});

// Toggle Vote Logic (Exposed to global window object so HTML inline click can trigger it)
window.toggleVote = function(gameId) {
    const isVoted = votedGames[gameId] === true;
    const gameVoteRef = db.ref(`votes/${gameId}`);

    // Optimistische Aktualisierung im Client für sofortiges Feedback
    if (isVoted) {
        delete votedGames[gameId];
    } else {
        votedGames[gameId] = true;
    }
    localStorage.setItem(VOTED_KEY, JSON.stringify(votedGames));
    renderGames(); // Sofort neu rendern, damit das Herz direkt rot/gefüllt wird

    // Atomically increment or decrement the vote count in Firebase Realtime Database
    gameVoteRef.transaction((currentVotes) => {
        if (isVoted) {
            // Decrement vote, ensuring it never goes below 0
            const nextVotes = (currentVotes || 0) - 1;
            return nextVotes < 0 ? 0 : nextVotes;
        } else {
            // Increment vote
            return (currentVotes || 0) + 1;
        }
    }, (error, committed, snapshot) => {
        if (error) {
            console.error("Fehler beim Abstimmen:", error);
            // Bei Fehler: Optimistisches Update zurückrollen
            if (isVoted) {
                votedGames[gameId] = true;
            } else {
                delete votedGames[gameId];
            }
            localStorage.setItem(VOTED_KEY, JSON.stringify(votedGames));
            renderGames();
        }
    });
};

// Dynamisch die Twitch- und YouTube-Embeds laden
function loadSocialEmbeds() {
    const hostname = window.location.hostname || "localhost";

    // 1. Twitch Live Stream
    const twitchContainer = document.getElementById('twitch-embed-container');
    if (twitchContainer && typeof Twitch !== 'undefined' && Twitch.Player) {
        twitchContainer.innerHTML = ''; // Container leeren
        
        // Twitch Player initialisieren
        const player = new Twitch.Player("twitch-embed-container", {
            width: "100%",
            height: "100%",
            channel: "RiskiTV",
            parent: [hostname],
            muted: true,
            autoplay: false
        });

        // Event-Listeners für Online/Offline Status des Streamers
        player.addEventListener(Twitch.Player.ONLINE, () => {
            const badge = document.querySelector('.twitch-sidebar .live-badge');
            if (badge) {
                badge.innerHTML = '<span class="live-dot"></span>LIVE';
                badge.classList.remove('offline');
                badge.classList.add('live');
            }
        });

        player.addEventListener(Twitch.Player.OFFLINE, () => {
            const badge = document.querySelector('.twitch-sidebar .live-badge');
            if (badge) {
                badge.innerHTML = 'OFFLINE';
                badge.classList.remove('live');
                badge.classList.add('offline');
            }
        });
    } else if (twitchContainer) {
        // Fallback falls das Twitch SDK blockiert wird / nicht lädt
        const iframe = document.createElement('iframe');
        iframe.src = `https://player.twitch.tv/?channel=RiskiTV&parent=${hostname}&muted=true&autoplay=false`;
        iframe.title = "Twitch Live Player";
        iframe.allowFullscreen = true;
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.position = "absolute";
        iframe.style.top = "0";
        iframe.style.left = "0";
        iframe.style.border = "none";
        twitchContainer.innerHTML = '';
        twitchContainer.appendChild(iframe);
    }

    // 2. Twitch Clip
    const clipContainer = document.getElementById('twitch-clip-container');
    if (clipContainer) {
        const clipSlug = window.TWITCH_CLIP_SLUG;
        if (!clipSlug) {
            clipContainer.innerHTML = `
                <div class="no-clip-placeholder">
                    <i class="fa-solid fa-film"></i>
                    <span>Kein Clip geladen.<br><small>Trage einen Clip-Slug in <b>custom_games.js</b> ein!</small></span>
                </div>
            `;
        } else {
            const iframe = document.createElement('iframe');
            iframe.src = `https://clips.twitch.tv/embed?clip=${clipSlug}&parent=${hostname}&autoplay=false`;
            iframe.title = "Twitch Clip Player";
            iframe.allowFullscreen = true;
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.position = "absolute";
            iframe.style.top = "0";
            iframe.style.left = "0";
            iframe.style.border = "none";
            clipContainer.innerHTML = '';
            clipContainer.appendChild(iframe);
        }
    }

    // 3. YouTube Neuestes Video / Live Stream (Oben)
    const ytVideoContainer = document.getElementById('youtube-video-container');
    if (ytVideoContainer) {
        const channelId = window.YOUTUBE_CHANNEL_ID || "UCBUNenXpADVmqjmT_bEJeEg";
        const iframe = document.createElement('iframe');
        // Zeigt immer den aktuellen Livestream an, wenn du online bist, andernfalls das Archiv / Offline-Bild
        iframe.src = `https://www.youtube.com/embed/live?channel=${channelId}`;
        iframe.title = "YouTube Live Player";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.position = "absolute";
        iframe.style.top = "0";
        iframe.style.left = "0";
        iframe.style.border = "none";
        ytVideoContainer.innerHTML = '';
        ytVideoContainer.appendChild(iframe);
    }

    // 4. YouTube Letzte Uploads (Unten)
    const ytShortContainer = document.getElementById('youtube-short-container');
    if (ytShortContainer) {
        const channelId = window.YOUTUBE_CHANNEL_ID || "UCBUNenXpADVmqjmT_bEJeEg";
        // Automatische Umwandlung von Kanal-ID (UC...) zu Upload-Playlist-ID (UU...)
        // Dies lädt die Playlist deiner Uploads, beginnend mit dem allerneuesten Video/Short/Stream
        const playlistId = channelId.startsWith("UC") ? "UU" + channelId.substring(2) : channelId;
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/videoseries?list=${playlistId}`;
        iframe.title = "YouTube Uploads Player";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.allowFullscreen = true;
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.position = "absolute";
        iframe.style.top = "0";
        iframe.style.left = "0";
        iframe.style.border = "none";
        ytShortContainer.innerHTML = '';
        ytShortContainer.appendChild(iframe);
    }
}

// Direkt ausführen, da app.js am Ende des Bodys geladen wird
loadSocialEmbeds();
