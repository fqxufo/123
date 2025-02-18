const ethers = require('ethers');
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');

const API_BASE_URL = 'https://api.fireverseai.com';
const WEB3_URL = 'https://web3.fireverseai.com';
const APP_URL = 'https://app.fireverseai.com';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Content-Type': 'application/json',
    'sec-ch-ua-platform': '"Windows"',
    'x-version': '1.0.100',
    'origin': APP_URL,
    'referer': `${APP_URL}/`,
    'sec-fetch-site': 'same-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty'
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));
function loadProxies() {
    try {
        if (fs.existsSync('proxy.txt')) {
            const proxyList = fs.readFileSync('proxy.txt', 'utf8')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
            
            return proxyList.map(proxy => {
                const [url, type = 'http'] = proxy.split('#').map(p => p.trim());
                return { url, type: type.toLowerCase() };
            });
        }
        return [];
    } catch (error) {
        console.log('⚠️ Error loading proxies:', error.message);
        return [];
    }
}
function createAxiosInstance(proxy = null) {
    const config = {
        timeout: 30000,
        headers: DEFAULT_HEADERS
    };

    if (proxy) {
        const { url, type } = proxy;
        try {
            switch (type) {
                case 'http':
                case 'https':
                    config.httpsAgent = new HttpsProxyAgent(url);
                    break;
                case 'socks4':
                case 'socks5':
                    config.httpsAgent = new SocksProxyAgent(url);
                    break;
            }
        } catch (error) {
            console.log(`⚠️ Error creating proxy agent: ${error.message}`);
            // Continue without proxy if there's an error
        }
    }

    return axios.create(config);
}
class FireverseMusicBot {
    constructor(token, accountIndex, proxy = null) {
        this.baseUrl = API_BASE_URL;
        this.token = token;
        this.accountIndex = accountIndex;
        this.playedSongs = new Set();
        this.songsToPlay = 25;
        this.songCount = 0;
        this.totalListeningTime = 0;
        this.lastHeartbeat = Date.now();
        this.headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.8',
            'content-type': 'application/json',
            'origin': APP_URL,
            'referer': `${APP_URL}/`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'x-version': '1.0.100',
            'token': token
        };
        this.axios = createAxiosInstance(proxy);
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    log(message, overwrite = false) {
        const prefix = `[Account ${this.accountIndex}] `;
        if (overwrite) {
            process.stdout.write(`\r${prefix}${message}`);
        } else {
            console.log(`${prefix}${message}`);
        }
    }

    async initialize() {
        try {
            await this.getUserInfo();
            return true;
        } catch (error) {
            this.log('Error initializing bot: ' + error.message);
            return false;
        }
    }

    async getUserInfo() {
        try {
            const response = await this.axios.get(
                `${this.baseUrl}/userInfo/getMyInfo`,
                { headers: this.headers }
            );
            const { level, expValue, score } = response.data.data;
            this.log(`Level: ${level} | Score: ${score} | EXP: ${expValue}`);
            return response.data.data;
        } catch (error) {
            this.log('Error getting user info: ' + error.message);
            return null;
        }
    }

    async getRecommendedSongs() {
        try {
            const response = await this.axios.post(
                `${this.baseUrl}/home/getRecommend`,
                { type: 1 },
                { headers: this.headers }
            );
            return response.data?.data || [];
        } catch (error) {
            this.log('Error getting recommended songs: ' + error.message);
            return [];
        }
    }

    async getMusicDetails(musicId) {
        try {
            const response = await this.axios.get(
                `${this.baseUrl}/music/getDetailById?musicId=${musicId}`,
                { headers: this.headers }
            );
            return response.data?.data;
        } catch (error) {
            this.log('Error getting music details: ' + error.message);
            return null;
        }
    }

    async sendHeartbeat() {
        try {
            const now = Date.now();
            if (now - this.lastHeartbeat >= 30000) {
                await this.axios.post(
                    `${this.baseUrl}/music/userOnlineTime/receiveHeartbeat`,
                    {},
                    { headers: this.headers }
                );
                this.lastHeartbeat = now;
                process.stdout.write('💓');
            }
        } catch (error) {
            // Silent heartbeat errors
        }
    }

    async playMusic(musicId) {
        try {
            await this.axios.post(
                `${this.baseUrl}/musicUserBehavior/playEvent`,
                { musicId, event: 'playing' },
                { headers: this.headers }
            );
            return true;
        } catch (error) {
            return false;
        }
    }

    async endMusic(musicId) {
        try {
            await this.axios.post(
                `${this.baseUrl}/musicUserBehavior/playEvent`,
                { musicId, event: 'playEnd' },
                { headers: this.headers }
            );
            return true;
        } catch (error) {
            return false;
        }
    }

    async likeMusic(musicId) {
        try {
            await this.axios.post(
                `${this.baseUrl}/musicMyFavorite/addToMyFavorite?musicId=${musicId}`,
                {},
                { headers: this.headers }
            );
            return true;
        } catch (error) {
            return false;
        }
    }

    async commentMusic(musicId) {
        try {
            const comments = [
                "Great song!",
                "Amazing tune!",
                "Love this!",
                "Fantastic music!",
                "Wonderful piece!"
            ];
            const randomComment = comments[Math.floor(Math.random() * comments.length)];
            
            await this.axios.post(
                `${this.baseUrl}/musicComment/addComment`,
                {
                    content: randomComment,
                    musicId,
                    parentId: 0,
                    rootId: 0
                },
                { headers: this.headers }
            );
            return true;
        } catch (error) {
            return false;
        }
    }

    async processMusic(song) {
        try {
            this.log(`\n▶️ Now Playing: ${song.musicName}`);
            this.log(`👤 Artist: ${song.author || 'Unknown'}`);
            
            const musicDetails = await this.getMusicDetails(song.id);
            const duration = musicDetails?.duration || song.duration || 180;
            this.log(`⏱️ Duration: ${this.formatTime(duration)}`);
            
            if (await this.playMusic(song.id)) {
                await this.likeMusic(song.id);
                this.log('❤️ Liked the song');
                
                await this.commentMusic(song.id);
                this.log('💬 Commented on the song');
                
                let secondsPlayed = 0;
                for (let timeLeft = duration; timeLeft > 0; timeLeft--) {
                    await this.sendHeartbeat();
                    secondsPlayed++;
                    this.totalListeningTime++;
                    
                    this.log(`⏳ Time remaining: ${this.formatTime(timeLeft)} | Total listening time: ${this.formatTime(this.totalListeningTime)}`, true);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                await this.endMusic(song.id);
                this.log('\n✅ Finished playing');
                return true;
            }
            return false;
        } catch (error) {
            this.log('Error processing music: ' + error.message);
            return false;
        }
    }

    async performTasks() {
        try {
            const songs = await this.getRecommendedSongs();
            
            for (const song of songs) {
                if (this.songCount >= this.songsToPlay) break;
                if (this.playedSongs.has(song.id)) continue;

                this.playedSongs.add(song.id);
                await this.processMusic(song);
                this.songCount++;
                
                this.log(`\n📊 Progress: ${this.songCount}/${this.songsToPlay} songs completed`);
                this.log(`🎵 Total listening time: ${this.formatTime(this.totalListeningTime)}`);
                
                await this.getUserInfo();
                
                if (this.songCount < this.songsToPlay) {
                    this.log('\n⏳ Waiting 5 seconds before next song...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
            
            this.log('\n🎉 Completed all tasks!');
            this.log(`📊 Final Statistics:`);
            this.log(`🎵 Songs Played: ${this.songCount}`);
            this.log(`⏱️ Total Listening Time: ${this.formatTime(this.totalListeningTime)}`);
        } catch (error) {
            this.log('Error performing tasks: ' + error.message);
        }
    }
}

async function getSession() {
    try {
        const response = await axios.get(`${API_BASE_URL}/walletConnect/getSession`, {
            headers: DEFAULT_HEADERS
        });
        return response.data.data;
    } catch (error) {
        console.error('❌ Error getting session:', error.message);
        return null;
    }
}

async function getNonce() {
    try {
        const response = await axios.get(`${API_BASE_URL}/walletConnect/nonce`);
        return response.data.data.nonce;
    } catch (error) {
        console.error('❌ Error getting nonce:', error.message);
        return null;
    }
}

async function signMessage(wallet, nonce) {
    const messageToSign = `web3.fireverseai.com wants you to sign in with your Ethereum account:\n${wallet.address}\n\nPlease sign with your account\n\nURI: https://web3.fireverseai.com\nVersion: 1\nChain ID: 8453\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
    
    const signingKey = new ethers.SigningKey(wallet.privateKey);
    const messageHash = ethers.hashMessage(messageToSign);
    const signature = signingKey.sign(messageHash);
    
    return {
        message: messageToSign,
        signature: signature.serialized
    };
}

async function verifyWallet(message, signature) {
    try {
        const response = await axios.post(
            `${API_BASE_URL}/walletConnect/verify`,
            {
                message,
                signature,
                wallet: "bee"
            },
            { headers: DEFAULT_HEADERS }
        );
        return response.data;
    } catch (error) {
        console.error('❌ Error verifying wallet:', error.message);
        return null;
    }
}

async function processWallet(privateKey) {
    try {
        // Create wallet from private key
        const wallet = new ethers.Wallet(privateKey);
        console.log('🔑 Using wallet address:', wallet.address);

        // Get session and nonce
        const session = await getSession();
        if (!session) return null;

        const nonce = await getNonce();
        if (!nonce) return null;

        // Sign message and verify wallet
        const { message, signature } = await signMessage(wallet, nonce);
        const verifyResult = await verifyWallet(message, signature);
        
        if (!verifyResult?.success) {
            console.log('❌ Wallet verification failed');
            return null;
        }

        const token = verifyResult.data.token;
        console.log('🔓 Login successful, got token');
        return token;
    } catch (error) {
        console.error('❌ Error processing wallet:', error.message);
        return null;
    }
}

async function getTokensFromWallets(walletFilePath, tokenFilePath) {
    try {
        // Read private keys from wallet file
        const content = fs.readFileSync(walletFilePath, 'utf8');
        const privateKeys = content.match(/Private Key: (0x[a-fA-F0-9]{64})/g)
            ?.map(match => match.split(': ')[1]) || [];

        if (privateKeys.length === 0) {
            console.log('❌ No private keys found in the wallet file');
            return;
        }

        console.log(`📝 Found ${privateKeys.length} wallets`);

        const tokens = [];

        for (let i = 0; i < privateKeys.length; i++) {
            console.log(`\n🔄 Processing wallet ${i + 1}/${privateKeys.length}`);
            const token = await processWallet(privateKeys[i]);
            if (token) {
                tokens.push(token);
            }

            if (i < privateKeys.length - 1) {
                console.log('\n⏳ Waiting 3 seconds before next wallet...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        // Save tokens to token.txt
        fs.writeFileSync(tokenFilePath, tokens.join('\n'));
        console.log(`\n✨ Tokens saved to ${tokenFilePath}`);
    } catch (error) {
        console.error('❌ Fatal error:', error);
    } finally {
        rl.close(); // Close readline interface
    }
}

async function readTokensFromFile() {
    try {
        if (fs.existsSync('tokens.txt')) {
            const tokenList = fs.readFileSync('tokens.txt', 'utf8')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#')); // 过滤掉空行和注释
            return tokenList;
        }
        return [];
    } catch (error) {
        console.log('⚠️ Error loading tokens:', error.message);
        return [];
    }
}

async function processTokenAndTasks(token, outputStream, index, total, proxy = null) {
    console.log(`\n🔄 Processing token ${index + 1}/${total}`);
    if (proxy) {
        console.log('🌐 Using proxy:', proxy.url, `(${proxy.type})`);
    } else {
        console.log('🌐 No proxy in use');
    }

    const bot = new FireverseMusicBot(token, index + 1, proxy);
    if (await bot.initialize()) {
        console.log('🎵 Starting music tasks...');
        await bot.performTasks();
    }

    return true;
}

async function waitFor24Hours() {
    console.log('\n⏳ Waiting 16 hours before next cycle...');
    await new Promise(resolve => setTimeout(resolve, 16 * 60 * 60 * 1000));
}

async function main() {
    try {
        console.log('🎵 Auto Task with Tokens 🎵');
        console.log('-----------------------------------------------------');

        // Load proxies from file
        const proxies = loadProxies();
        console.log(`📡 Loaded ${proxies.length} proxies from proxy.txt`);

        const outputStream = fs.createWriteStream('task_logs.txt', { flags: 'a' });

        while (true) {
          const walletFilePath = 'generated_wallets.txt';
        const tokenFilePath = 'tokens.txt';
        await getTokensFromWallets(walletFilePath, tokenFilePath);
            const tokens = await readTokensFromFile();
            if (tokens.length === 0) {
                console.log('❌ No tokens found in tokens.txt');
                break;
            }

            console.log(`\n🔄 Processing ${tokens.length} tokens...`);

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                // Get proxy for this token (round-robin)
                const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;

                await processTokenAndTasks(token, outputStream, i, tokens.length, proxy);

                if (i < tokens.length - 1) {
                    console.log('\n⏳ Waiting 3 seconds before next token...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

            await waitFor24Hours();
        }

        outputStream.end();
        console.log('\n✨ Complete!');
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Start the program
main().catch(console.error);