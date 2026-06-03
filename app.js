// Local Storage keys
const DB_KEY = 'riski_mock_db';
const VOTED_KEY = 'riski_voted_games';

// Load base games from imported data (games_data.js)
let rawGames = window.IMPORTED_GAMES || [];
let baseGames = rawGames.map(g => ({
    id: g.appid.toString(),
    title: g.name,
    image: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${g.appid}/capsule_231x87.jpg`
}));

// Initialize Mock DB if not exists or if imported games changed
let localDb = JSON.parse(localStorage.getItem(DB_KEY) || 'null');

if (!localDb || localDb.length !== baseGames.length) {
    // Merge existing votes if possible, or start fresh
    const newDb = baseGames.map(game => {
        const existingGame = localDb ? localDb.find(g => g.id === game.id) : null;
        return {
            ...game,
            votes: existingGame ? existingGame.votes : 0
        };
    });
    localStorage.setItem(DB_KEY, JSON.stringify(newDb));
    localDb = newDb;
}

// State
let games = localDb;
let votedGames = JSON.parse(localStorage.getItem(VOTED_KEY) || '{}');

// DOM Elements
const gameListEl = document.getElementById('game-list');
const loadingEl = document.getElementById('loading');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');

// State
let searchQuery = "";
let sortMode = "votes"; // 'votes', 'az', 'za'

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderGames();
    });
}

if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
        sortMode = e.target.value;
        renderGames();
    });
}

// Render Function
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
            <img src="${game.image}" alt="${game.title}" class="game-image" onerror="this.src='https://via.placeholder.com/231x87/150a21/a855f7?text=No+Image'">
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

// Toggle Vote Logic
window.toggleVote = function(gameId) {
    const gameIndex = games.findIndex(g => g.id === gameId);
    if (gameIndex === -1) return;

    if (votedGames[gameId]) {
        // Remove vote
        games[gameIndex].votes--;
        delete votedGames[gameId];
    } else {
        // Add vote
        games[gameIndex].votes++;
        votedGames[gameId] = true;
    }

    // Save to local storage
    localStorage.setItem(VOTED_KEY, JSON.stringify(votedGames));
    localStorage.setItem(DB_KEY, JSON.stringify(games));

    // Re-render
    renderGames();
};

// Simulated Real-time update (Fetching from LocalStorage DB)
function loadData() {
    const data = JSON.parse(localStorage.getItem(DB_KEY));
    if (data) {
        games = data;
        renderGames();
    }
}

// Initial Load
setTimeout(loadData, 500); // Small delay to show loading animation

// Listen for storage changes across tabs (Simulates real-time feeling slightly)
window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY) {
        loadData();
    }
});

/* 
======================================================================
FIREBASE INTEGRATION INSTRUCTIONS (For REAL Real-time syncing)
======================================================================
Um echte Echtzeit-Votes (über verschiedene PCs hinweg) zu haben, 
benötigst du ein Backend wie Firebase. 

1. Gehe zu https://firebase.google.com/ und erstelle ein Projekt.
2. Erstelle eine "Realtime Database" im Testmodus (oder mit entsprechenden Security Rules).
3. Füge in der index.html die Firebase SDK-Skripte ein (oben auskommentiert).
4. Ersetze diesen app.js Code durch folgenden:

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "DEIN_API_KEY",
  authDomain: "DEIN_PROJEKT.firebaseapp.com",
  databaseURL: "https://DEIN_PROJEKT.firebasedatabase.app",
  projectId: "DEIN_PROJEKT",
  storageBucket: "DEIN_PROJEKT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let games = [];
const VOTED_KEY = 'riski_voted_games';
let votedGames = JSON.parse(localStorage.getItem(VOTED_KEY) || '{}');

const gameListEl = document.getElementById('game-list');
const loadingEl = document.getElementById('loading');

function renderGames() {
    games.sort((a, b) => b.votes - a.votes);
    gameListEl.innerHTML = '';
    games.forEach((game, index) => {
        const isVoted = votedGames[game.id] === true;
        // ... (selber Render-Code wie oben) ...
    });
    loadingEl.classList.add('hidden');
    gameListEl.classList.remove('hidden');
}

const gamesRef = ref(db, 'games');
onValue(gamesRef, (snapshot) => {
  const data = snapshot.val();
  if (data) {
    games = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    renderGames();
  }
});

window.toggleVote = function(gameId) {
  const isVoted = votedGames[gameId];
  const gameRef = ref(db, 'games/' + gameId + '/votes');
  
  runTransaction(gameRef, (currentVotes) => {
    if (isVoted) {
      return (currentVotes || 0) - 1;
    } else {
      return (currentVotes || 0) + 1;
    }
  }).then(() => {
    if (isVoted) {
      delete votedGames[gameId];
    } else {
      votedGames[gameId] = true;
    }
    localStorage.setItem(VOTED_KEY, JSON.stringify(votedGames));
  });
};
*/
