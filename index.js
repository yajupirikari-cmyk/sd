const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

// ================= 設定部分 =================
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '1515109697680576684';
const PORT = process.env.PORT || 8080;

// 許可されたユーザーのIDリスト
const AUTHORIZED_USERS = [
    '1486923873004945509',
    '1256533169856057396',
    '832165092702683156'
];
// ===========================================

// --- Webサイト用のサーバ設定 (Express) ---
const app = express();

app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Web server is running on port ${PORT}`);
});
// ---------------------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages, // DMを受け取るために必要
        GatewayIntentBits.MessageContent  // メッセージの中身を読むために必要
    ],
    partials: [Partials.Channel, Partials.Message] // キャッシュされていないDMを受け取るために必要
});

// RenderのIPがCloudflare等に弾かれないよう、ブラウザと全く同じヘッダーを設定
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    "Sec-Ch-Ua": "\"Not/A)Brand\";v=\"8\", \"Chromium\";v=\"126\", \"Google Chrome\";v=\"126\"",
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": "\"Windows\"",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
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

// 指定した数だけサーバーを探してチャンネルに送信する関数
async function findAndSendServers(count) {
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (!channel) {
        console.error(`【エラー】チャンネル（ID: ${CHANNEL_ID}）が見つかりません。`);
        return 0;
    }

    console.log(`ディス速から最新のサーバー情報を取得しています... (目標: ${count}件)`);
    const servers = await getDissokuServers();

    if (!servers || servers.length === 0) {
        console.log("データが空のためスキップします。");
        return 0;
    }

    // 配列のシャッフル
    for (let i = servers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [servers[i], servers[j]] = [servers[j], servers[i]];
    }

    let foundCount = 0;

    for (const server of servers) {
        if (foundCount >= count) break;

        console.log(`「${server.title}」から直接招待URLを抽出中...`);
        // 1.5秒待機
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const inviteUrl = await getDirectInviteLink(server.detail_link);
        if (inviteUrl) {
            await channel.send(inviteUrl);
            console.log(`【送信完了】参加ボタン付きカード（本物）を投稿しました ➔ ${inviteUrl}`);
            foundCount++;
        }
    }

    return foundCount;
}

client.once(Events.ClientReady, () => {
    console.log(`成功: ${client.user.tag} としてログインしました！`);
    
    // 初回実行と30分ごとのループ (定期実行は1件ずつ送信)
    findAndSendServers(1);
    setInterval(() => findAndSendServers(1), 30 * 60 * 1000);
});

// メッセージ受信時の処理（DMでのコマンド）
client.on(Events.MessageCreate, async (message) => {
    // Botからのメッセージは無視
    if (message.author.bot) return;

    // DM（サーバー外）かつ、許可されたユーザーかどうか判定
    if (!message.guild && AUTHORIZED_USERS.includes(message.author.id)) {
        if (message.content.startsWith('!pal ')) {
            const args = message.content.split(' ');
            const num = parseInt(args[1], 10);
            
            if (!isNaN(num) && num > 0) {
                await message.reply(`承知しました！ ${num}個のサーバーを探してチャンネル（<#${CHANNEL_ID}>）に送信します。\n（※少し時間がかかります）`);
                const sentCount = await findAndSendServers(num);
                await message.reply(`処理が完了しました！（送信成功: ${sentCount}件）`);
            } else {
                await message.reply('数値を正しく入力してください。例: `!pal 3`');
            }
        }
    }
});

if (TOKEN) {
    client.login(TOKEN).catch(err => {
        console.error("ログインエラー:", err);
    });
} else {
    console.error("【致命的なエラー】シークレット（環境変数）に 'DISCORD_TOKEN' が設定されていません。");
}
