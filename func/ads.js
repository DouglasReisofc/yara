const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');
const moment = require('moment-timezone');
const chalk = require('chalk');

// Inicialização do cliente WhatsApp
const client = require('../client.js');
const config = require('../dono/config.json');

const numerobot = config.numeroBot;
const siteapi = config.siteapi;

// Definição do fuso horário
const TIMEZONE = "America/Sao_Paulo";

function formatBox(title, lines) {
    const width = Math.max(...lines.map(l => l.length));
    console.log(chalk.blueBright('┌' + '─'.repeat(width + 2) + '┐'));
    console.log(chalk.blueBright('│ ' + title.padEnd(width) + ' │'));
    console.log(chalk.blueBright('├' + '─'.repeat(width + 2) + '┤'));
    lines.forEach(l => console.log(chalk.yellowBright('│ ' + l.padEnd(width) + ' │')));
    console.log(chalk.blueBright('└' + '─'.repeat(width + 2) + '┘'));
}

// Flag para evitar execuções concorrentes
let isProcessing = false;

// Função para parsear intervalos (1h, 30m, 10s) com extra texto
function parseInterval(intervalStr) {
    // Use regex para extrair o número e a unidade do início da string
    const regex = /^(\d+)\s*([hdms])/i;
    const match = intervalStr.match(regex);
    if (!match) throw new Error('Intervalo inválido: ' + intervalStr);

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
        case 'h': return moment.duration(value, 'hours');
        case 'd': return moment.duration(value, 'days');
        case 'm': return moment.duration(value, 'minutes');
        case 's': return moment.duration(value, 'seconds');
        default: throw new Error('Unidade de intervalo desconhecida: ' + unit);
    }
}

// Como os anúncios serão obtidos sempre da API, não há necessidade de
// carregar ou salvar dados em arquivos locais.

// Função para atualizar 'last_sent_at' na API
async function updateAdLastSentAtInAPI(adId, lastSentAt) {
    try {
        await axios.put(`${siteapi}/ads/${adId}/update-last-sent`, {
            last_sent_at: lastSentAt
        });
        //console.log(`[${moment().tz(TIMEZONE).format()}] 'last_sent_at' atualizado na API para o anúncio ID ${adId}.`);
    } catch (error) {
        //console.error(`[${moment().tz(TIMEZONE).format()}] Erro ao atualizar 'last_sent_at' na API para o anúncio ID ${adId}:`, error.message);
    }
}

// Função para verificar se o anúncio está elegível para envio
function canSendAd(ad) {
    const now = moment.tz(TIMEZONE);
    const lastSentAt = ad.last_sent_at ? moment.tz(ad.last_sent_at, TIMEZONE) : null;
    let duration;

    try {
        duration = parseInterval(ad.interval);
    } catch (error) {
        //console.error(`[${now.format()}] Anúncio ID ${ad.id} possui intervalo inválido: "${ad.interval}". Erro: ${error.message}`);
        return { eligible: false, remainingTime: null };
    }

    if (!lastSentAt) {
        //console.log(`[${now.format()}] Anúncio ID ${ad.id} nunca foi enviado. Está elegível para envio.`);
        return { eligible: true, remainingTime: null };
    }

    const diff = now.diff(lastSentAt, 'milliseconds');
    if (diff >= duration.asMilliseconds()) {
        //console.log(`[${now.format()}] Anúncio ID ${ad.id} está elegível para envio. Intervalo "${ad.interval}" cumprido.`);
        return { eligible: true, remainingTime: null };
    } else {
        const remainingTime = moment.duration(duration.asMilliseconds() - diff);
        //console.log(`[${now.format()}] Anúncio ID ${ad.id} não está elegível para envio. Faltam ${remainingTime.minutes()}m ${remainingTime.seconds()}s.`);
        return { eligible: false, remainingTime };
    }
}

// Busca os anúncios diretamente da API principal
async function fetchAdsFromAPI() {
    try {
        const response = await axios.get(`${siteapi}/ads/bot/${numerobot}`);
        if (response.data && Array.isArray(response.data.ads)) {
            return response.data.ads;
        }
    } catch (error) {
        //console.error(`Erro ao buscar anúncios da API principal: ${error.message}`);
    }
    return [];
}

// Função para enviar o anúncio para o grupo
async function sendAdToGroup(ad) {
    const sendTime = moment().tz(TIMEZONE).format();

    try {
        //console.log(`[${sendTime}] Enviando anúncio ID ${ad.id} para o grupo ${ad.group_identifier}...`);

        let media = null;
        if (ad.media_url) {
            try {
                media = await MessageMedia.fromUrl(ad.media_url, { timeout: 10000 }); // Ajuste o timeout conforme necessário
            } catch (mediaError) {
                //console.error(`[${sendTime}] Erro ao baixar mídia para o anúncio ID ${ad.id}: ${mediaError.message}`);
                // Neste exemplo, enviaremos a mensagem de texto mesmo se a mídia falhar
            }
        }

        if (media) {
            await client.sendMessage(ad.group_identifier, media, { caption: ad.message });
        } else {
            await client.sendMessage(ad.group_identifier, ad.message);
        }

        formatBox('ANÚNCIO ENVIADO', [
            `Grupo: ${ad.group_identifier}`,
            `ID: ${ad.id}`
        ]);

        // Atualiza 'last_sent_at' na API
        const now = moment().tz(TIMEZONE).toISOString();
        await updateAdLastSentAtInAPI(ad.id, now);
    } catch (error) {
        //console.error(`[${sendTime}] Erro ao enviar o anúncio para o grupo ${ad.group_identifier}:`, error.message);
    }
}

// Função para processar os anúncios obtidos da API
async function processAds() {
    const ads = await fetchAdsFromAPI();

    formatBox('VERIFICAÇÃO DE ADS', [
        `Anúncios encontrados: ${Array.isArray(ads) ? ads.length : 0}`
    ]);

    if (!Array.isArray(ads) || ads.length === 0) {
        return;
    }

    for (let ad of ads) {
        try {
            if (!ad.id || !ad.group_identifier || !ad.interval || !ad.message) {
                continue;
            }

            const eligibility = canSendAd(ad);
            if (!eligibility.eligible) {
                continue;
            }

            try {
                await client.getChatById(ad.group_identifier);
            } catch {
                continue;
            }

            await sendAdToGroup(ad);
        } catch {
            // erro silencioso por anúncio
            continue;
        }
    }
}

// Função principal de início do processo
async function startAdProcessing() {
    if (isProcessing) {
        //console.log(`[${moment().tz(TIMEZONE).format()}] Processo de envio já está em andamento. Ignorando chamada.`);
        return;
    }

    isProcessing = true;

    formatBox('PROCESSO DE ADS', [
        `Horário: ${moment().tz(TIMEZONE).format('DD/MM HH:mm:ss')}`
    ]);

    try {
        await processAds();
    } catch (error) {
        //console.error(`[${moment().tz(TIMEZONE).format()}] Erro no processo de envio de anúncios:`, error.message);
    } finally {
        isProcessing = false;
    }
}

// Exportar a função de processamento para ser agendada após a inicialização do cliente
module.exports = { startAdProcessing };
