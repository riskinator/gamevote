// ⚙️ SOCIAL MEDIA KONFIGURATION (Hier deine IDs eintragen!)
window.YOUTUBE_CHANNEL_ID = "UCxBUB76stDxvjqB_u3bgCzw"; // Deine YouTube Kanal-ID (UC...)
window.TWITCH_CLIP_SLUG = "BraveBoringPonyTakeNRG-9w_jT22m4k_l5n5g"; // Der Name deines Twitch-Clips (aus der Clip-URL)

// 🎮 Eigene Spiele (Epic Games, Xbox Game Pass, Tarkov etc.) hinzufügen
//
// Anleitung:
// 1. Hier kannst du Spiele eintragen, die nicht in deiner Steam-Bibliothek sind.
// 2. Tipp: Viele Epic- oder Game Pass-Spiele gibt es auch auf Steam. Wenn du hier
//    die Steam-"appid" einträgst, wird das Vorschaubild automatisch geladen!
// 3. Wenn ein Spiel gar nicht auf Steam existiert (wie Escape from Tarkov),
//    kannst du eine beliebige Bild-URL bei "image" eintragen.
// 4. Deine Steam-Spiele in games_data.js werden durch diese Liste NICHT überschrieben.

window.CUSTOM_GAMES = [
    { 
        appid: "3932890", 
        name: "Escape from Tarkov",
        image: "https://cdn-ext.fanatical.com/production/product/1280x720/9ef9fb90-d0fd-457d-a8f9-47f50aafc2f5.jpeg"
    },
    { 
        appid: "2073620", // Steam AppID für "Arena Breakout: Infinite" -> Bild wird automatisch geladen!
        name: "Arena Breakout: Infinite" 
    },
    { 
        appid: "271590", // Steam AppID für Grand Theft Auto V (Epic Games Version) -> Bild wird automatisch geladen!
        name: "Grand Theft Auto V" 
    },
    { 
        appid: "1240440", // Steam AppID für Halo Infinite (Xbox Game Pass Version) -> Bild wird automatisch geladen!
        name: "Halo Infinite" 
    }
];
