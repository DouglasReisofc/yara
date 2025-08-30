const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const chalk = require('chalk');
const path = require('path');
const qrcodeTerminal = require('qrcode-terminal'); // Biblioteca para imprimir QR Code no terminal
const QRCode = require('qrcode');
const config = require('./dono/config.json');
const nodemailer = require('nodemailer');

// Caminho do Google Chrome para uso pelo Puppeteer
const chromePath = process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome';

// Número do bot utilizado para gerar código de pareamento
const botNumber = config.numeroBot ? String(config.numeroBot).replace(/\D/g, '') : null;

// Configurações de e-mail para envio do código de pareamento
const emailConfig = config.email || {};
let transporter = null;
let latestQrBase64 = null;
let credentialsSent = false;

if (emailConfig.smtp) {
    // Permite certificados autoassinados e configurações extras via JSON
    transporter = nodemailer.createTransport({
        ...emailConfig.smtp,
        tls: { rejectUnauthorized: false, ...(emailConfig.smtp.tls || {}) }
    });
}

async function sendAuthEmail(code, qrBase64) {
    if (!transporter || !emailConfig.to || credentialsSent) return;
    try {
        // Verifica conexão com servidor SMTP para evitar erros de "Greeting never received"
        await transporter.verify();
    } catch (err) {
        console.error('Falha ao conectar com servidor SMTP:', err);
        return;
    }
    try {
        const textParts = [];
        if (code) {
            textParts.push(`Seu código de pareamento é: ${code}`);
        }
        if (qrBase64) {
            textParts.push(`QR Code (Base64): ${qrBase64}`);
        }

        if (!code && !qrBase64) return;

        const mailOptions = {
            from: emailConfig.from || emailConfig.smtp.auth?.user,
            to: emailConfig.to,
            subject: `Dados de autenticação do ${config.nomeBot || 'bot'}`,
            text: textParts.join('\n')
        };

        if (qrBase64) {
            mailOptions.attachments = [{
                filename: 'qrcode.png',
                content: Buffer.from(qrBase64, 'base64'),
                cid: 'qrcode'
            }];
            mailOptions.html = textParts.map(p => `<p>${p}</p>`).join('') +
                '<img src="cid:qrcode" alt="QR Code"/>';
        }

        await transporter.sendMail(mailOptions);
        credentialsSent = true;
        console.log(chalk.green(`✉️ Dados de autenticação enviados para ${emailConfig.to}`));
    } catch (err) {
        console.error('Erro ao enviar dados de autenticação por e-mail:', err);
    }
}

async function requestPairingCodeWithRetries() {
    if (!botNumber) return;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await client.requestPairingCode(botNumber);
            return; // código será capturado pelo evento 'code'
        } catch (err) {
            console.error(`Erro ao gerar código de pareamento (tentativa ${attempt}/3):`, err);
            if (attempt < 3) {
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
    if (!credentialsSent && latestQrBase64) {
        await sendAuthEmail(null, latestQrBase64);
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
        headless: false,
        executablePath: chromePath,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--disable-session-crashed-bubble",
            "--disable-infobars",
            "--disable-features=site-per-process,TranslateUI",
            "--disable-blink-features=AutomationControlled",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--single-process",
            `--proxy-bypass-list=<-loopback>`
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: null
    },
    ...(botNumber ? { pairWithPhoneNumber: { phoneNumber: botNumber } } : {})
});




// 📌 Exibir QR Code e agendar envio por e-mail caso o código de pareamento não seja recebido
client.on('qr', async qr => {
    console.log(chalk.yellow('📲 Escaneie o QR Code abaixo para conectar-se ao bot:'));
    qrcodeTerminal.generate(qr, { small: true });

    try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        latestQrBase64 = qrDataUrl.split(',')[1];
    } catch (err) {
        console.error('Erro ao gerar base64 do QR Code:', err);
    }

    // Solicita código de pareamento usando o número configurado
    requestPairingCodeWithRetries();

    // Caso o código de pareamento não seja recebido em 20s, envia apenas o QR por e-mail
    setTimeout(() => {
        if (!credentialsSent && latestQrBase64) {
            sendAuthEmail(null, latestQrBase64);
        }
    }, 20000);
});

// 📌 Recebe código de pareamento e envia por e-mail
client.on('code', async code => {
    if (credentialsSent) return;
    console.log(chalk.cyan(`🔐 Código de pareamento: ${code}`));
    await sendAuthEmail(code, latestQrBase64);
});

// 📌 Indica que a sessão foi restaurada com sucesso
client.on('ready', async () => {
    console.log(chalk.green(`🚀 Bot '${config.nomeBot || 'Bot'}' iniciado com sucesso e pronto para uso!`));
    if (config.numeroDono) {
        await client.sendMessage(
            config.numeroDono + '@c.us',
            `✅ O bot '${config.nomeBot || 'Bot'}' está ativo e pronto para uso!`
        );
    }
});

// 📌 Lida com falhas de autenticação e reinicia o bot
client.on('auth_failure', async () => {
    console.error('❌ Falha na autenticação! Reiniciando cliente...');
    await client.sendMessage(
        config.numeroDono + '@c.us',
        '⚠️ Falha na autenticação. O bot será reiniciado.'
    );
    process.exit(1);
});

// 📌 Reinicia automaticamente caso seja desconectado
client.on('disconnected', async (reason) => {
    console.error(`🔌 Conexão perdida (${reason}). Reiniciando cliente...`);
    await client.sendMessage(
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
        await client.sendMessage(
            config.numeroDono + '@c.us',
            '⚠️ A sessão foi detectada como inválida. O bot será reiniciado.'
        );
        process.exit(1);
    }
});

client.initialize();

module.exports = client;

