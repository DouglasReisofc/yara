const axios = require("axios");
const config = require("../dono/config.json");
const moment = require('moment-timezone');
const fs = require('fs');
const client = require('../client.js');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const FormData = require('form-data');
const chalk = require('chalk');

const siteapi = config.siteapi;
const numerobot = config.numeroBot;

function formatBox(title, lines) {
    const width = Math.max(...lines.map(l => l.length));
    console.log(chalk.blueBright('┌' + '─'.repeat(width + 2) + '┐'));
    console.log(chalk.blueBright('│ ' + title.padEnd(width) + ' │'));
    console.log(chalk.blueBright('├' + '─'.repeat(width + 2) + '┤'));
    lines.forEach(l => console.log(chalk.yellowBright('│ ' + l.padEnd(width) + ' │')));
    console.log(chalk.blueBright('└' + '─'.repeat(width + 2) + '┘'));
}

async function fetchHorapgFromAPI() {
    try {
        const url = `${siteapi}/group/horapg?bot=${numerobot}`;
        console.log(`[HORAPG] Fazendo requisição para: ${url}`);
        const response = await axios.get(url);
        console.log(`[HORAPG] Resposta da API:`, response.data);
        
        if (response.data && Array.isArray(response.data.data)) {
            console.log(`[HORAPG] Grupos encontrados: ${response.data.data.length}`);
            return response.data.data;
        } else {
            console.log(`[HORAPG] Estrutura de resposta inválida:`, response.data);
        }
    } catch (error) {
        console.error('Erro ao buscar horapg da API:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
    return [];
}

async function storeHorapg(groupJid, data = {}) {
    try {
        const encoded = encodeURIComponent(groupJid);

        // Se imagem_horapg possuir dados de mídia, envia como multipart
        if (data.imagem_horapg && data.imagem_horapg.data) {
            const form = new FormData();
            form.append('horapg', data.horapg);
            form.append('intervalo_horapg', data.intervalo_horapg);

            const buffer = Buffer.from(data.imagem_horapg.data, 'base64');
            const ext = data.imagem_horapg.mimetype?.split('/')[1] || 'jpg';
            form.append(
                'imagem_horapg',
                buffer,
                { filename: `horapg.${ext}`, contentType: data.imagem_horapg.mimetype || 'image/jpeg' }
            );

            const res = await axios.post(`${siteapi}/group/${encoded}/horapg`, form, {
                headers: form.getHeaders(),
            });
            return res.data;
        } else {
            const payload = { ...data };
            delete payload.imagem_horapg;
            const res = await axios.post(`${siteapi}/group/${encoded}/horapg`, payload);
            return res.data;
        }
    } catch (err) {
        console.error('Erro ao salvar horapg:', err.message);
        return null;
    }
}

async function updateLastSent(groupJid) {
    try {
        const encoded = encodeURIComponent(groupJid);
        await axios.patch(`${siteapi}/group/${encoded}/horapg/last-sent`);
    } catch (err) {
        console.error('Erro ao atualizar último envio horapg:', err.message);
    }
}

async function deleteHorapg(groupJid) {
    try {
        const encoded = encodeURIComponent(groupJid);
        await axios.delete(`${siteapi}/group/${encoded}/horapg`);
    } catch (err) {
        console.error('Erro ao deletar horapg:', err.message);
    }
}

async function getHorapg(groupJid) {
    try {
        const encoded = encodeURIComponent(groupJid);
        const response = await axios.get(`${siteapi}/group/${encoded}/horapg`);
        if (response.data && response.data.settings) {
            return response.data.settings;
        }
    } catch (err) {
        console.error('Erro ao obter horapg:', err.message);
    }
    return null;
}


function obterHorarioAtual() {
    const agora = moment.tz('America/Sao_Paulo');
    agora.subtract(0, 'hours');

    const hora = agora.hours();
    const minuto = agora.minutes().toString().padStart(2, '0');
    const horarioAtual = `${hora.toString().padStart(2, '0')}:${minuto}`;



    return horarioAtual;
}


function gerarHorariosAleatorios(horaBase, minIntervalo = 0, maxIntervalo = 59) {
    function gerarHorarioAleatorio(minutosInicio, minutosFim) {
        const minutoAleatorio = Math.floor(Math.random() * (minutosFim - minutosInicio + 1)) + minutosInicio;
        return `${horaBase}:${minutoAleatorio.toString().padStart(2, '0')}`;
    }

    const plataformas = [
        "🐯 FORTUNE TIGER", "🐉 DRAGON LUCK", "🐰 FORTUNE RABBIT", "🐭 FORTUNE MOUSE",
        "🐘 GANESHA GOLD", "👙 BIKINI", "🥊 MUAY THAI", "🎪 CIRCUS", "🐂 FORTUNE OX",
        "💰 DOUBLE FORTUNE", "🐉🐅 DRAGON TIGER LUCK", "🧞 GENIE'S WISHES(GENIO)",
        "🌳🌲 JUNGLE DELIGHT", "🐷 PIGGY GOLD", "👑 MIDAS FORTUNE", "🌞🌛 SUN & MOON",
        "🦹‍♂️ WILD BANDITO", "🔥🕊️ PHOENIX RISES", "🛒 SUPERMARKET SPREE",
        "🚢👨‍✈️ CAPTAIN BOUNTY", "🎃 MISTER HOLLOWEEN", "🍀💰 LEPRECHAUN RICHES"
    ];

    const horarios = plataformas.map(plataforma => ({
        name: plataforma,
        times: Array.from({ length: 7 }, () => {
            const primeiroHorario = gerarHorarioAleatorio(minIntervalo, maxIntervalo);
            const segundoHorario = gerarHorarioAleatorio(minIntervalo, maxIntervalo);
            return `${primeiroHorario} - ${segundoHorario}`;
        })
    }));

    return horarios;
}


function compararHorarios(horario1, horario2) {
    const [hora1, minuto1] = horario1.split(':').map(Number);
    const [hora2, minuto2] = horario2.split(':').map(Number);

    if (hora1 > hora2) return 1;
    if (hora1 < hora2) return -1;
    if (minuto1 > minuto2) return 1;
    if (minuto1 < minuto2) return -1;
    return 0;
}


function buscarHorarios(horarioAtual) {
    try {
        const horaBase = horarioAtual.split(':')[0];
        const horariosGerados = gerarHorariosAleatorios(horaBase, 0, 59);
        let mensagem = `🍀 *SUGESTÃO DE HORÁRIOS PAGANTES DAS ${horaBase}* 💰\n\n`;
        horariosGerados.forEach(section => {
            mensagem += `${section.name}\n`;
            section.times.forEach(time => {
                mensagem += `   ${time}\n`;
            });
            mensagem += '\n';
        });
        mensagem += `\nDica: alterne entre os giros entre normal e turbo, se vier um Grande Ganho, PARE e espere a próxima brecha!\n🔞NÃO INDICADO PARA MENORES🔞\nLembrando a todos!\nHorários de probabilidades aumentam muito sua chance de lucrar, mas lembrando que não anula a chance de perda, por mais que seja baixa jogue com responsabilidade...`;
        mensagem += `\n\nSistema By: Aurora\nCreat: Aurora Bot Oficial`;

        return mensagem;
    } catch (err) {
        return null;
    }
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function converterIntervaloParaMs(intervalo) {
    const regex = /^(\d+)([hm])$/;
    const match = intervalo.match(regex);
    if (!match) return null;

    const quantidade = parseInt(match[1], 10);
    const unidade = match[2];

    if (unidade === 'h') {
        return quantidade * 60 * 60 * 1000;
    } else if (unidade === 'm') {
        return quantidade * 60 * 1000;
    }
    return null;
}

async function verificarHorariosEEnviarMensagens() {
    const timestampAtual = moment.tz('America/Sao_Paulo').valueOf();
    const defaultImage = "https://raw.githubusercontent.com/DouglasReisofc/imagensplataformas/refs/heads/main/global.jpeg";

    let registros = [];
    try {
        registros = await fetchHorapgFromAPI();
        console.log(`[HORAPG] Buscando grupos ativos. Encontrados: ${registros.length}`);
    } catch (err) {
        console.error('[HORAPG] Erro ao buscar grupos:', err.message);
        registros = [];
    }

    formatBox('VERIFICAÇÃO HORAPG', [
        `Grupos recebidos: ${Array.isArray(registros) ? registros.length : 0}`
    ]);

    for (const registro of registros) {
        const grupoJid = registro.group_id;
        if (!grupoJid) continue;

        try {
            await client.getChatById(grupoJid);
        } catch {
            continue;
        }

        try {
            if ((registro.horapg === 1 || registro.horapg === '1') && registro.intervalo_horapg) {
                const intervaloMs = converterIntervaloParaMs(registro.intervalo_horapg);
                if (intervaloMs === null) continue;

                if (!registro.ultimo_envio_horapg) {
                    await updateLastSent(grupoJid);
                    continue;
                }

                const ultimaNotificacao = registro.ultimo_envio_horapg
                    ? moment.tz(registro.ultimo_envio_horapg, 'America/Sao_Paulo').valueOf()
                    : null;

                if (!ultimaNotificacao || (timestampAtual - ultimaNotificacao) >= intervaloMs) {
                    const horarioAtual = obterHorarioAtual();
                    const mensagem = buscarHorarios(horarioAtual);

                    const imagemUrl = registro.imagem_horapg || defaultImage;

                    if (mensagem) {
                        try {
                            const media = await MessageMedia.fromUrl(imagemUrl);
                            await client.sendMessage(grupoJid, media, { caption: mensagem });
                            formatBox('HORAPG ENVIADO', [
                                `Grupo: ${grupoJid}`,
                                `Intervalo: ${registro.intervalo_horapg}`
                            ]);
                        } catch (err) {
                            try {
                                const media = await MessageMedia.fromUrl(defaultImage);
                                await client.sendMessage(grupoJid, media, { caption: mensagem });
                            } catch {
                                // falha silenciosa
                            }
                        }
                    } else {
                        try {
                            await client.sendMessage(grupoJid, "_❲❗❳   Desculpe, Sem Horário Atualmente_");
                        } catch {
                            // erro silencioso
                        }
                    }

                    await updateLastSent(grupoJid);

                    await sleep(2000);
                }
            }
        } catch {
            // erro silencioso por grupo
        }
    }
}


setInterval(verificarHorariosEEnviarMensagens, 60000);


const fileName = path.basename(__filename);
const file = require.resolve(__filename);
let timeout;
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        delete require.cache[file];
        require(file);
    }, 2000);
});

module.exports = {
    obterHorarioAtual,
    buscarHorarios,
    verificarHorariosEEnviarMensagens,
    fetchHorapgFromAPI,
    storeHorapg,
    updateLastSent,
    deleteHorapg,
    getHorapg
};
