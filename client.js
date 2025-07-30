const { Client, LocalAuth } = require('whatsapp-web.js');
const os = require('os');
const fs = require('fs');
const chalk = require('chalk');
const path = require('path');
const qrcode = require('qrcode-terminal'); // Biblioteca para imprimir QR Code no terminal
const config = require('./dono/config.json');

const { sendMessageReliable } = require('./func/funcoes');

let chromePath = '/usr/bin/chromium-browser';

if (os.platform() === 'win32') {
    chromePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
} else if (os.platform() === 'linux') {
    if (fs.existsSync('/usr/bin/brave-browser')) {
        chromePath = '/usr/bin/brave-browser';
    } else if (fs.existsSync('/home/douglas/.config/chromium')) {
        chromePath = '/home/douglas/.config/chromium';
    }
}


const sessionPath = path.join(__dirname, '.wwebjs_auth');
const sessionExists = fs.existsSync(sessionPath);
console.log(sessionExists ? '🔄 Sessão encontrada, tentando restaurar...' : '⚡ Nenhuma sessão encontrada, escaneie o QR Code.');

const clientId = config.nomeBot || 'default-bot';

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: clientId
    }),
    puppeteer: {
        executablePath: chromePath,
        headless: false,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
            "--disable-session-crashed-bubble",
            "--disable-infobars",
            "--disable-features=site-per-process",
            "--disable-blink-features=AutomationControlled",
            `--proxy-bypass-list=<-loopback>`
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: null
    }
});

// Compat: garanta que client.getChat exista
if (typeof client.getChat !== 'function' && typeof client.getChatById === 'function') {
    client.getChat = async (chatId) => client.getChatById(chatId);
}

// Loga o retorno de todas as mensagens enviadas
const originalSendMessage = client.sendMessage.bind(client);
client.sendMessage = async (...args) => {
    const result = await originalSendMessage(...args);
    console.log('sendMessage returned:', result);
    return result;
};

// 📌 Exibir QR Code no terminal
client.on('qr', qr => {
    console.log(chalk.yellow('📲 Escaneie o QR Code abaixo para conectar-se ao bot:'));
    qrcode.generate(qr, { small: true });
});

// 📌 Indica que a sessão foi restaurada com sucesso
client.on('ready', async () => {
    console.log(chalk.green(`🚀 Bot '${config.nomeBot || 'Bot'}' iniciado com sucesso e pronto para uso!`));
    if (config.numeroDono) {
        await sendMessageReliable(
            client,
            config.numeroDono + '@c.us',
            `✅ O bot '${config.nomeBot || 'Bot'}' está ativo e pronto para uso!`
        );
    }
});

// 📌 Lida com falhas de autenticação e reinicia o bot
client.on('auth_failure', async () => {
    console.error('❌ Falha na autenticação! Reiniciando cliente...');
    await sendMessageReliable(
        client,
        config.numeroDono + '@c.us',
        '⚠️ Falha na autenticação. O bot será reiniciado.'
    );
    process.exit(1);
});

// 📌 Reinicia automaticamente caso seja desconectado
client.on('disconnected', async (reason) => {
    console.error(`🔌 Conexão perdida (${reason}). Reiniciando cliente...`);
    await sendMessageReliable(
        client,
        config.numeroDono + '@c.us',
        `⚠️ O bot foi desconectado (${reason}). Reiniciando...`
    );
    process.exit(1);
});

// 📌 Detecta mudanças no estado da sessão e reinicia se necessário
client.on('change_state', async (state) => {
    console.log(`🔄 Estado atualizado: ${state}`);
    if (['CONFLICT', 'UNPAIRED', 'UNLAUNCHED', 'BANNED'].includes(state)) {
        console.warn('⚠️ Sessão pode estar inválida. Reiniciando...');
        await sendMessageReliable(
            client,
            config.numeroDono + '@c.us',
            '⚠️ A sessão foi detectada como inválida. O bot será reiniciado.'
        );
        process.exit(1);
    }
});

client.initialize();

// ✅ Mantendo a exportação do cliente no mesmo formato que você já usava
module.exports = client;
