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

// Load base games from games_data.js, epic_games_data.js and custom_games.js
// Fallback arrays to avoid crashes if variables are undefined
const rawGames = window.IMPORTED_GAMES || [];
const rawEpicGames = window.IMPORTED_EPIC_GAMES || [];
const customGames = window.CUSTOM_GAMES || [];

// State variables
let baseGames = []; // Wird dynamisch nach Laden von Game Pass befüllt
let games = [];
let votedGames = JSON.parse(localStorage.getItem(VOTED_KEY) || '{}');
let searchQuery = "";
let sortMode = "votes"; // 'votes', 'az', 'za'

// DOM Elements
const gameListEl = document.getElementById('game-list');
const loadingEl = document.getElementById('loading');
const searchInput = document.getElementById('search-input');

const sortDropdown = document.getElementById('sort-dropdown');
const dropdownTrigger = document.getElementById('dropdown-trigger');
const selectedSortLabel = document.getElementById('selected-sort');
const optionItems = document.querySelectorAll('.dropdown-option');

// Set up Search Input listener
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderGames();
    });
}

// Set up Custom Sort Dropdown listeners
if (dropdownTrigger && sortDropdown) {
    dropdownTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        sortDropdown.classList.toggle('open');
        const isOpen = sortDropdown.classList.contains('open');
        dropdownTrigger.setAttribute('aria-expanded', isOpen);
    });

    document.addEventListener('click', () => {
        if (sortDropdown.classList.contains('open')) {
            sortDropdown.classList.remove('open');
            dropdownTrigger.setAttribute('aria-expanded', 'false');
        }
    });

    if (optionItems) {
        optionItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = item.getAttribute('data-value');
                const label = item.textContent;

                selectedSortLabel.textContent = label;

                optionItems.forEach(opt => {
                    opt.classList.remove('selected');
                    opt.setAttribute('aria-selected', 'false');
                });
                item.classList.add('selected');
                item.setAttribute('aria-selected', 'true');

                sortMode = value;
                renderGames();

                sortDropdown.classList.remove('open');
                dropdownTrigger.setAttribute('aria-expanded', 'false');
            });
        });
    }
}

// 🔤 Titel-Normalisierung für präzise Dubletten-Erkennung
function normalizeTitle(title) {
    if (!title) return "";
    return title.toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Entfernt Leerzeichen, Sonderzeichen & Satzzeichen
        .trim();
}

// 🌐 CORS-Proxy Helper mit automatischem Failover
async function fetchWithProxy(url) {
    // 1. Versuch: api.codetabs.com (erwartet encodete URL, sehr zuverlässig)
    try {
        const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
            return await response.json();
        }
    } catch (e) {
        console.warn("codetabs proxy fehlgeschlagen, versuche allorigins...", e);
    }
    
    // 2. Versuch: api.allorigins.win (verlässlicher Fallback)
    try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
            const data = await response.json();
            return JSON.parse(data.contents);
        }
    } catch (e) {
        console.warn("allorigins.win fehlgeschlagen...", e);
    }
    
    throw new Error("Konnte API-Daten über keinen CORS-Proxy laden.");
}

// 🎮 Xbox Game Pass PC Spieleliste abrufen & cachen (24 Stunden)
async function fetchGamePassPCGames() {
    const CACHE_KEY = 'riski_gamepass_cache_v2';
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 Stunden in Millisekunden
    
    // 1. Cache prüfen
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
        try {
            const cache = JSON.parse(cachedData);
            if (Date.now() - cache.timestamp < CACHE_DURATION) {
                console.log("🎮 Xbox Game Pass Spiele aus Cache geladen.");
                return cache.games;
            }
        } catch (e) {
            console.error("Fehler beim Lesen des Game Pass Caches:", e);
        }
    }
    
    console.log("🔄 Lade Xbox Game Pass Spiele frisch von Microsoft...");
    
    try {
        // 2. Produkt-IDs von der Game Pass Liste holen (PC Game Pass SIGL ID)
        const siglUrl = `https://catalog.gamepass.com/sigls/v2?id=fdd9e2a7-0fee-49f6-ad69-4354098401ff&language=de-de&market=DE`;
        const siglData = await fetchWithProxy(siglUrl);
        
        const productIds = siglData
            .map(item => item.id)
            .filter(id => id && id.length > 5); // Nur valide IDs filtern
        
        if (productIds.length === 0) return [];
        
        // 3. Details für die Produkt-IDs in Blöcken abrufen (max. 50 auf einmal)
        const games = [];
        const chunkSize = 50;
        
        for (let i = 0; i < productIds.length; i += chunkSize) {
            // Schutz vor Rate-Limits
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            
            const chunk = productIds.slice(i, i + chunkSize);
            const idsString = chunk.join(',');
            const detailsUrl = `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${idsString}&market=DE&languages=de-de`;
            
            const detailsData = await fetchWithProxy(detailsUrl);
            if (detailsData.Products && Array.isArray(detailsData.Products)) {
                detailsData.Products.forEach(prod => {
                    const title = prod.LocalizedProperties?.[0]?.ProductTitle || prod.LocalizedProperties?.[0]?.ShortTitle;
                    
                    // Bild extrahieren (Querformat bevorzugt, ansonsten Hochformat-BoxArt)
                    let imageUrl = "";
                    const images = prod.LocalizedProperties?.[0]?.Images;
                    if (images && Array.isArray(images)) {
                        const wideArt = images.find(img => img.ImagePurpose === "SuperHeroArt" || img.ImagePurpose === "TitledHeroImage" || img.ImagePurpose === "WideFeaturedPhoto" || img.ImagePurpose === "WideFeaturedPhotos");
                        const boxArt = images.find(img => img.ImagePurpose === "BoxArt" || img.ImagePurpose === "Poster" || img.ImagePurpose === "StoreLogo");
                        const selectedImg = wideArt || boxArt || images[0];
                        if (selectedImg && selectedImg.Uri) {
                            imageUrl = "https:" + selectedImg.Uri;
                        }
                    }
                    
                    if (title) {
                        games.push({
                            productId: prod.ProductId,
                            title: title,
                            image: imageUrl
                        });
                    }
                });
            }
        }
        
        // 4. In Cache speichern
        if (games.length > 0) {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                games: games
            }));
            console.log(`✅ Game Pass: ${games.length} Spiele erfolgreich geladen.`);
        }
        
        return games;
    } catch (error) {
        console.error("Fehler beim Abrufen der Xbox Game Pass Spiele:", error);
        // Falls ein Fehler auftritt, versuchen wir trotzdem den alten Cache zu nehmen, selbst wenn er abgelaufen ist
        if (cachedData) {
            try {
                return JSON.parse(cachedData).games;
            } catch (e) {}
        }
        return [];
    }
}

// 🔀 Zusammenführen & Dubletten bereinigen mit Priorisierung
function buildUnifiedGameList(steamGames, epicGames, customGames, gamePassGames) {
    const gamesMap = new Map(); // Key: normalizedTitle -> Game Object
    
    // Hilfsfunktion zum Registrieren eines Spiels
    function registerGame(title, source, id, image, appid = null) {
        const norm = normalizeTitle(title);
        if (!norm) return;
        
        if (gamesMap.has(norm)) {
            // Spiel existiert bereits, Plattform-Quelle hinzufügen
            const existing = gamesMap.get(norm);
            existing.sources.add(source);
            
            // Wenn die neue Quelle Steam ist und wir noch kein Steam-Bild haben, aktualisieren wir es
            if (source === 'steam' && appid) {
                existing.id = appid;
                existing.image = image;
            }
        } else {
            // Neues Spiel hinzufügen
            gamesMap.set(norm, {
                id: id,
                title: title,
                image: image,
                sources: new Set([source])
            });
        }
    }
    
    // 1. Steam Spiele (Höchste Priorität für ID & Bild)
    steamGames.forEach(g => {
        registerGame(
            g.name, 
            'steam', 
            g.appid.toString(), 
            g.image || `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${g.appid}/capsule_231x87.jpg`, 
            g.appid.toString()
        );
    });
    
    // 2. Custom Spiele (Manuelle Spiele wie Escape from Tarkov etc.)
    customGames.forEach(g => {
        const hasAppid = g.appid && g.appid.toString();
        const id = hasAppid ? g.appid.toString() : 'custom_' + normalizeTitle(g.name);
        const img = g.image || (hasAppid ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${g.appid}/capsule_231x87.jpg` : `https://placehold.co/231x87/150a21/a855f7?text=${encodeURIComponent(g.name)}`);
        registerGame(g.name, 'custom', id, img, hasAppid);
    });
    
    // 3. Epic Games
    epicGames.forEach(title => {
        const id = 'epic_' + normalizeTitle(title);
        const img = `https://placehold.co/231x87/150a21/0078f2?text=${encodeURIComponent(title)}`;
        registerGame(title, 'epic', id, img);
    });
    
    // 4. Xbox Game Pass
    gamePassGames.forEach(g => {
        const id = 'gamepass_' + g.productId;
        const img = g.image || `https://placehold.co/231x87/150a21/107c10?text=${encodeURIComponent(g.title)}`;
        registerGame(g.title, 'gamepass', id, img);
    });
    
    // Konvertiere Map zurück in Array und Set in Array
    return Array.from(gamesMap.values()).map(game => ({
        ...game,
        sources: Array.from(game.sources)
    }));
}

// 🖼️ Bild-Optimierung: Saliency-basiertes Smart Crop + CDN-Komprimierung für alle Quellen
//
// Strategie pro Bildquelle:
//  • Steam (steamstatic.com)     → bereits 231x87 capsule, perfekt, keine Änderung nötig
//  • placehold.co                → SVG-Vektor, sofort, keine Änderung nötig
//  • Microsoft/Xbox (Querformat) → CDN-Parameter ?w=231&q=75 (bereits Querformat, passt gut)
//  • Microsoft/Xbox (Hochformat) → über weserv.nl fit=attention (logo-orientierter Zuschnitt)
//  • Alle anderen externen URLs  → über weserv.nl fit=attention (logo-orientierter Zuschnitt)
//
// "fit=attention" nutzt einen Saliency-Algorithmus: Er erkennt automatisch Bereiche mit
// hohem Kontrast und klaren Kanten (= Logos & Titel) und wählt diesen als Ausschnitt.
// Das ist die beste praktikable Lösung ohne eine kostenpflichtige OCR/KI-API.
function optimizeImageUrl(url) {
    if (!url) return 'https://placehold.co/231x87/150a21/a855f7?text=No+Image';
    
    // Steam: bereits 231x87 capsule format, ~10KB, ideal
    // placehold.co: reiner SVG-Vektor, instant
    if (url.includes('steamstatic.com') || url.includes('placehold.co')) {
        return url;
    }
    
    // Microsoft / Xbox CDN: wir leiten ALLE Xbox-Bilder jetzt durch weserv.nl
    // damit auch BoxArt/Poster-Bilder (Hochformat) sauber auf den Titelbereich zugeschnitten werden.
    if (url.includes('store-images.s-microsoft.com') || url.includes('xboxlive.com')) {
        const cleanUrl = url.split('?')[0].replace(/^https?:\/\//i, '');
        return `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}&w=231&h=87&fit=attention&q=80`;
    }
    
    // Alle anderen externen Bilder (custom_games.js, etc.)
    // fit=attention → saliency-basierter Zuschnitt (Logo/Titelbereich wird bevorzugt)
    try {
        const cleanUrl = url.replace(/^https?:\/\//i, '');
        return `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}&w=231&h=87&fit=attention&q=80`;
    } catch (e) {
        console.warn("Fehler bei weserv.nl Bild-Optimierung, verwende Original-URL:", e);
        return url;
    }
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
        li.style.animationDelay = `${index * 0.05}s`;
        
        // Plattform-Badges HTML aufbauen
        const sourceBadges = game.sources.map(src => {
            if (src === 'steam') return `<span class="platform-badge steam" title="Auf Steam verfügbar"><i class="fa-brands fa-steam"></i> Steam</span>`;
            if (src === 'epic') return `<span class="platform-badge epic" title="Im Epic Games Store verfügbar"><i class="fa-solid fa-gamepad"></i> Epic</span>`;
            if (src === 'gamepass') return `<span class="platform-badge gamepass" title="Im Xbox Game Pass verfügbar"><i class="fa-brands fa-xbox"></i> Game Pass</span>`;
            if (src === 'custom') return `<span class="platform-badge custom" title="Als eigenständige Version (Standalone / Extern) verfügbar"><i class="fa-solid fa-laptop"></i> Standalone</span>`;
            return '';
        }).join('');
        
        const optimizedImg = optimizeImageUrl(game.image);
        
        li.innerHTML = `
            <div class="rank">#${index + 1}</div>
            <img src="${optimizedImg}" alt="${game.title}" class="game-image" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='https://placehold.co/231x87/150a21/a855f7?text=' + encodeURIComponent(this.alt);">
            <div class="game-info">
                <h2 class="game-title">${game.title}</h2>
                <div class="platform-badges">${sourceBadges}</div>
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

// Twitch Status-Check (Lightweight API Abfrage ohne Iframe-Fehler)
async function checkTwitchStatus() {
    try {
        // decapi.me hat keine CORS-Header → über allorigins.win proxyen
        const twitchUrl = 'https://decapi.me/twitch/uptime/RiskiTV?offline_msg=offline';
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(twitchUrl)}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
            const data = await response.json();
            const text = (data.contents || '').trim().toLowerCase();
            const isLive = text !== 'offline' && text !== '' && !text.startsWith('error');
            updateStreamStatus(isLive);
        }
    } catch (e) {
        console.warn("Fehler beim Abrufen des Twitch-Status:", e);
    }
}

// Twitch Status-Check initialisieren
function initTwitchStatusCheck() {
    checkTwitchStatus();
    // Alle 3 Minuten aktualisieren
    setInterval(checkTwitchStatus, 3 * 60 * 1000);
}

// Stream-Status-Anzeige in der Navbar aktualisieren
function updateStreamStatus(isLive) {
    const badge = document.getElementById('stream-status');
    if (!badge) return;
    const textEl = badge.querySelector('.status-text');
    
    if (isLive) {
        badge.classList.remove('offline');
        badge.classList.add('live');
        if (textEl) textEl.textContent = 'Stream: LIVE';
    } else {
        badge.classList.remove('live');
        badge.classList.add('offline');
        if (textEl) textEl.textContent = 'Stream: OFFLINE';
    }
}

// Initialisierung der Anwendung beim Laden
async function initApp() {
    // 1. Twitch Statusprüfung starten
    initTwitchStatusCheck();
    
    // 2. Xbox Game Pass Spiele abrufen (aus Cache oder API)
    const gamePassGames = await fetchGamePassPCGames();
    
    // 3. Bibliotheken zusammenführen & bereinigen
    baseGames = buildUnifiedGameList(rawGames, rawEpicGames, customGames, gamePassGames);
    
    // 4. State aufsetzen & Firebase Listener aktivieren
    games = baseGames.map(game => ({ ...game, votes: 0 }));
    
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
}

// Anwendung starten
initApp();
