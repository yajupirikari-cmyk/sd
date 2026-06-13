const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

// ================= 設定部分 =================
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1515109697680576684';
const PORT = process.env.PORT || 8080;
// ===========================================

// --- Webサイト用のサーバ設定 (Express) ---
// Render等のPaaSでポートバインディングが必要なため
const app = express();

app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Web server is running on port ${PORT}`);
});
// ---------------------------------------------

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "ja-JP,ja;q=0.9",
};

async function getDissokuServers() {
    const url = "https://dissoku.net/ja/servers";
    try {
        const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(response.data);
        const servers = [];

        $('a[href]').each((i, el) => {
            let href = $(el).attr('href');
            if (href.includes('/servers/') && !href.endsWith('/servers')) {
                const title = $(el).text().trim();
                if (title) {
                    if (!href.startsWith('http')) {
                        href = "https://dissoku.net" + href;
                    }
                    servers.push({ title, detail_link: href });
                }
            }
        });

        const uniqueServers = [];
        const seen = new Set();
        for (const s of servers) {
            if (!seen.has(s.detail_link)) {
                seen.add(s.detail_link);
                uniqueServers.push(s);
            }
        }

        return uniqueServers;
    } catch (error) {
        console.error("一覧取得エラー:", error.message);
        return [];
    }
}

async function getDirectInviteLink(detailUrl) {
    try {
        const response = await axios.get(detailUrl, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(response.data);
        let inviteLink = null;

        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            if (href.includes('discord.gg/') || href.includes('discord.com/invite/')) {
                inviteLink = href;
                return false; // ループを抜ける
            }
        });

        return inviteLink;
    } catch (error) {
        console.error("詳細ページ解析エラー:", error.message);
        return null;
    }
}

async function sendRandomServer() {
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (!channel) {
        console.error(`【エラー】チャンネル（ID: ${CHANNEL_ID}）が見つかりません。`);
        return;
    }

    console.log("ディス速から最新のサーバー情報を取得しています...");
    const servers = await getDissokuServers();

    if (!servers || servers.length === 0) {
        console.log("データが空のためスキップします。");
        return;
    }

    // 配列のシャッフル
    for (let i = servers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [servers[i], servers[j]] = [servers[j], servers[i]];
    }

    let directLink = null;

    for (const server of servers.slice(0, 5)) {
        console.log(`「${server.title}」から直接招待URLを抽出中...`);
        // 1.5秒待機
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const inviteUrl = await getDirectInviteLink(server.detail_link);
        if (inviteUrl) {
            directLink = inviteUrl;
            break;
        }
    }

    if (directLink) {
        await channel.send(directLink);
        console.log(`【送信完了】参加ボタン付きカード（本物）を投稿しました ➔ ${directLink}`);
    } else {
        console.log("直接招待リンクが取得できなかったため、今回は送信をスキップしました。");
    }
}

client.once('ready', () => {
    console.log(`成功: ${client.user.tag} としてログインしました！`);
    
    // 初回実行と30分ごとのループ
    sendRandomServer();
    setInterval(sendRandomServer, 30 * 60 * 1000);
});

if (TOKEN) {
    client.login(TOKEN).catch(err => {
        console.error("ログインエラー:", err);
    });
} else {
    console.error("【致命的なエラー】シークレット（環境変数）に 'DISCORD_TOKEN' が設定されていません。");
}
