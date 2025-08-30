const client = require('../client.js');
const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ytdl = require('ytdl-core');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const yts = require("yt-search");
const { youtube } = require("btch-downloader");
const { exec } = require('child_process');
const config = require('../dono/config.json');

const searchYTFromApi = async (query) => {
    try {
        const baseUrl = config.botadminapi;
        const apiKey = config.botadminapikey;
        const url = `${baseUrl}/api/download/ytsearch?apikey=${apiKey}&nome=${encodeURIComponent(query)}`;

        const response = await axios.get(url);
        const data = response.data || {};
        return data.resultados || data.result || data.results || [];
    } catch (err) {
        console.error(`Erro ao consultar ytsearch: ${err.message}`);
        return [];
    }
};

const sendSearchResults = async (query, chatId) => {
    try {
        const chat = await client.getChatById(chatId);
        chat.sendStateTyping();

        const results = await searchYTFromApi(query);

        if (Array.isArray(results) && results.length > 0) {
            const list = results.slice(0, 5)
                .map((r, i) => `*${i + 1}.* ${r.title}\n${r.url}`)
                .join('\n\n');
            await client.sendMessage(chatId, list);
        } else {
            await client.sendMessage(chatId, '❌ Nenhum resultado encontrado.');
        }
    } catch (error) {
        console.error(`Erro ao consultar ytsearch: ${error.message}`);
        await client.sendMessage(chatId, '❌ Erro ao consultar a API.');
    }
};

const downloadAudioFromApi = async (videoUrl, chatId) => {
    try {
        const chat = await client.getChatById(chatId);
        chat.sendStateTyping();

        const baseUrl = config.botadminapi;
        const apiKey = config.botadminapikey;
        const url = `${baseUrl}/api/download/globalaudio?url=${encodeURIComponent(videoUrl)}&apikey=${apiKey}`;

        const { data } = await axios.get(url);
        const result = data.result || data.results || data;
        const audioUrl = result.download_url || result.link || result.url;
        const title = result.title || 'audio';

        if (audioUrl) {
            const media = await MessageMedia.fromUrl(audioUrl, {
                filename: `${title}.mp3`,
                mimeType: 'audio/mpeg',
            });
            await client.sendMessage(chatId, media, { caption: title });
        } else {
            await client.sendMessage(chatId, '❌ Não foi possível baixar o áudio.');
        }
    } catch (error) {
        console.error(`Erro ao baixar áudio: ${error.message}`);
        await client.sendMessage(chatId, '❌ Erro ao baixar áudio.');
    }
};

const downloadVideoFromApi = async (videoUrl, chatId) => {
    try {
        const chat = await client.getChatById(chatId);
        chat.sendStateTyping();

        const baseUrl = config.botadminapi;
        const apiKey = config.botadminapikey;
        const url = `${baseUrl}/api/download/globalvideo?url=${encodeURIComponent(videoUrl)}&apikey=${apiKey}`;

        const { data } = await axios.get(url);
        const result = data.result || data.results || data;
        const videoLink = result.download_url || result.link || result.url;
        const title = result.title || 'video';

        if (videoLink) {
            const media = await MessageMedia.fromUrl(videoLink, {
                filename: `${title}.mp4`,
                mimeType: 'video/mp4',
                unsafeMime: true,
            });
            await client.sendMessage(chatId, media, { caption: title });
        } else {
            await client.sendMessage(chatId, '❌ Não foi possível baixar o vídeo.');
        }
    } catch (error) {
        console.error(`Erro ao baixar vídeo: ${error.message}`);
        await client.sendMessage(chatId, '❌ Erro ao baixar vídeo.');
    }
};

// Pasta temporária para salvar arquivos
const tmpFolder = './tmp';

if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder);
}

// Função para processar mídias do TikTok (vídeo e imagens)
const processTikTokMedia = async (link, chatId) => {
    try {
        const chat = await client.getChatById(chatId);
        
        // Enviar status "digitando"
        chat.sendStateTyping();

        const apiUrl = `https://www.tikwm.com/api/?url=${link}`;
        const response = await axios.get(apiUrl);

        if (response.data && response.data.data) {
            const mediaData = response.data.data;

            // Construir o caption com as informações disponíveis
            const caption = `🎬 *Título*: ${mediaData.title || 'Sem título'}
👤 *Autor*: ${mediaData.author.nickname || 'Desconhecido'} (@${mediaData.author.unique_id || 'N/A'})
👀 *Visualizações*: ${mediaData.play_count || 'N/A'}
❤️ *Curtidas*: ${mediaData.digg_count || 'N/A'}
💬 *Comentários*: ${mediaData.comment_count || 'N/A'}
🔗 *Compartilhamentos*: ${mediaData.share_count || 'N/A'}
🎵 *Música*: ${mediaData.music_info.title || 'Sem título'} por ${mediaData.music_info.author || 'Desconhecido'}

     ᶜᵒʳᵗᵉˢᶦᵃ ᵇʸ ᴰᵒᵘᵍˡᵃˢ ᴿᵉᶦˢ`;

            // Verificar se há imagens no retorno da API
            if (mediaData.images && mediaData.images.length > 0) {
                // Enviar todas as imagens sem legenda
                for (const imageUrl of mediaData.images) {
                    const media = await MessageMedia.fromUrl(imageUrl, {
                        filename: `TikTokImage_${Date.now()}.jpeg`,
                        mimeType: 'image/jpeg',
                    });
                    await client.sendMessage(chatId, media);
                }

                // Após enviar todas as imagens, enviar a legenda detalhada
                await client.sendMessage(chatId, caption);
            } else if (mediaData.play) {
                // Se não houver imagens, enviar o vídeo
                let mediaUrl = mediaData.play;

                // Garantir que a URL termina com ".mp4"
                if (!mediaUrl.endsWith('.mp4')) {
                    mediaUrl += '.mp4';
                }

                const media = await MessageMedia.fromUrl(mediaUrl, {
                    filename: `${mediaData.title || 'TikTok'}.mp4`,
                    mimeType: 'video/mp4',
                    unsafeMime: true,
                });

                await client.sendMessage(chatId, media, { caption });
            } else {
                await client.sendMessage(chatId, 'Nenhuma mídia disponível no link fornecido.');
            }
        } else {
            throw new Error('Erro ao obter dados da API do TikTok.');
        }
    } catch (error) {
        await client.sendMessage(chatId, '❌ Ocorreu um erro ao processar o link. Tente novamente mais tarde.');
    }
};

const processKwaiMedia = async (link, chatId) => {
    try {
        const chat = await client.getChatById(chatId);

        // Enviar status "digitando"
        chat.sendStateTyping();

        // Configuração para o youtubedl
        const options = {
            dumpSingleJson: true, // Retorna o JSON do vídeo
            noCheckCertificates: true,
            format: 'best', // Melhor formato disponível
        };

        // Chamada ao youtubedl para processar o link
        const videoInfo = await youtubedl(link, options);

        // Verificar se os dados do vídeo foram capturados
        if (videoInfo && videoInfo.url) {
            const videoUrl = videoInfo.url;
            const title = videoInfo.title?.split('. ')[1]?.trim() || 'Vídeo do Kwai'; // Corrige o título
            const uploaderMatch = videoInfo.fulltitle.match(/^(.+?) \(/); // Extrai apenas o nome do autor
            const uploader = uploaderMatch ? uploaderMatch[1].trim() : 'Desconhecido';
            const viewCount = videoInfo.view_count || 'N/A';
            const likeCount = videoInfo.like_count || 'N/A';
            const duration = videoInfo.duration
                ? `${Math.floor(videoInfo.duration / 60)} min ${videoInfo.duration % 60} sec`
                : 'Desconhecido';

            // Montar a legenda
            const caption = `🎬 *Título*: ${title}
👤 *Autor*: ${uploader}
👀 *Visualizações*: ${viewCount}
❤️ *Curtidas*: ${likeCount}
⏱ *Duração*: ${duration}

ᶜᵒʳᵗᵉˢᶦᵃ ᵇʸ ᴰᵒᵘᵍˡᵃˢ ᴿᵉᶦˢ`;

            // Enviar o vídeo usando o URL direto
            const media = await MessageMedia.fromUrl(videoUrl, {
                filename: `${title}.mp4`,
                mimeType: 'video/mp4',
                unsafeMime: true,
            });

            await client.sendMessage(chatId, media, { caption });
        } else {
            await client.sendMessage(chatId, '❌ Não foi possível processar o link do Kwai. Verifique o link e tente novamente.');
        }
    } catch (error) {
        await client.sendMessage(chatId, '❌ Ocorreu um erro ao processar o link do Kwai. Tente novamente mais tarde.');
    }
};



const downloadVideoFromYouTube = async (query, chatId) => {
    try {
        const chat = await client.getChatById(chatId);
        chat.sendStateTyping();

        console.log("🔄 Realizando busca do vídeo...");

        let videoLink = query;

        // Verifica se a consulta é um link válido
        if (!ytdl.validateURL(query)) {
            console.log("🔍 Realizando busca no YouTube...");

            // Caso não seja um link, realizar uma pesquisa
            const searchResults = await yts(query);
            if (searchResults.videos.length === 0) {
                await client.sendMessage(chatId, '❌ Nenhum vídeo encontrado para a pesquisa fornecida.');
                return;
            }

            // Pega o primeiro vídeo da pesquisa
            videoLink = searchResults.videos[0].url; // Usar o link do vídeo encontrado
        }

        // Faz a requisição para a API que retorna o link direto
        const apiUrl = `https://fitting-highly-husky.ngrok-free.app/api/youtube?url=${encodeURIComponent(videoLink)}`;
        const response = await fetch(apiUrl);
        const videoData = await response.json();

        if (videoData && videoData.mp4_link) {
            console.log("✔️ Vídeo obtido com sucesso");

            const title = videoData.title || 'Vídeo do YouTube';
            const videoUrl = videoData.mp4_link;
            const thumbnail = videoData.thumbnail || '';
            const views = videoData.views || 'N/A';
            const likes = videoData.like_count || 'N/A';
            const uploader = videoData.uploader || 'Desconhecido';

            // Mensagem do vídeo para o caption
            const videoInfoMessage = `
🎬 *Título*: ${title}
👀 *Visualizações*: ${views}
👍 *Curtidas*: ${likes}
👤 *Uploader*: ${uploader}
Para baixar o áudio, digite: 

!ytmp3 ${videoLink}
            `;
            
            // Enviar a thumbnail, se disponível
            if (thumbnail) {
                const media = await MessageMedia.fromUrl(thumbnail);
                await client.sendMessage(chatId, media, { caption: videoInfoMessage });
            }

            // Criação da mídia diretamente a partir do link da API
            const media = await MessageMedia.fromUrl(videoUrl, {
                filename: `${title}.mp4`,
                mimeType: 'video/mp4',
                unsafeMime: true
            });

            // Enviar o vídeo como mensagem
            await client.sendMessage(chatId, media, { caption: `🎬 *Título*: ${title}\n👀 *Visualizações*: ${videoData.views || 'N/A'}` });

            console.log("✔️ Vídeo enviado com sucesso.");
        } else {
            await client.sendMessage(chatId, '❌ Não foi possível obter o vídeo da API.');
        }

    } catch (error) {
        console.error(`❌ Erro ao baixar o vídeo: ${error.message}`);
        await client.sendMessage(chatId, '❌ Ocorreu um erro ao baixar o vídeo. Tente novamente mais tarde.');
    }
};

const downloadAudioFromYouTube = async (query, chatId) => {
    try {
        const chat = await client.getChatById(chatId);
        chat.sendStateTyping();

        console.log("🔄 Iniciando a extração de áudio...");

        let videoLink = query;

        // Configurações para obter o áudio
        const options = {
            dumpSingleJson: true,
            format: 'bestaudio',
            noPlaylist: true,
        };

        // Configurar proxy, se disponível
        if (config.proxyServer) {
            const proxyUrl = new URL(config.proxyServer);
            if (config.proxyAuth?.username && config.proxyAuth?.password) {
                proxyUrl.username = config.proxyAuth.username;
                proxyUrl.password = config.proxyAuth.password;
            }
            options.proxy = proxyUrl.toString();  // Definindo o proxy
        }

        // Verifica se a consulta é um link válido
        if (!ytdl.validateURL(query)) {
            console.log("🔍 Realizando busca no YouTube...");

            // Caso não seja um link, realizar uma pesquisa
            const searchResults = await yts(query);
            if (searchResults.videos.length === 0) {
                await client.sendMessage(chatId, '❌ Nenhum áudio encontrado para a pesquisa fornecida.');
                return;
            }

            // Pega o primeiro vídeo da pesquisa
            videoLink = searchResults.videos[0].url; // Usar o link do vídeo encontrado
        }

        // Obter informações do vídeo
        const videoInfo = await youtubedl(videoLink, options);
        console.log("✔️ Áudio obtido com sucesso");

        const title = videoInfo.title || 'Áudio do YouTube';
        const thumbnail = videoInfo.thumbnail || '';
        const views = videoInfo.view_count || 'N/A';
        const likes = videoInfo.like_count || 'N/A';
        const uploader = videoInfo.uploader || 'Desconhecido';

        const tempVideoFile = path.join(tmpFolder, `${title}.mp4`);
        const tempAudioFile = path.join(tmpFolder, `${title}.mp3`);

        // Enviar a thumbnail, com as informações do vídeo no caption
        const videoInfoMessage = `
🎬 *Título*: ${title}
👀 *Visualizações*: ${views}
👍 *Curtidas*: ${likes}
👤 *Uploader*: ${uploader}

Para baixar o vídeo, digite: 

!ytmp4 ${videoLink}
        `;
        if (thumbnail) {
            const media = await MessageMedia.fromUrl(thumbnail);
            await client.sendMessage(chatId, media, { caption: videoInfoMessage });
        }

        // Baixar o vídeo primeiro (será utilizado para extrair o áudio)
        await youtubedl(videoLink, {
            output: tempVideoFile,
            format: 'bestaudio',
            noPlaylist: true,
            proxy: options.proxy // Usando o proxy para o download
        });

        // Extrair o áudio
        await new Promise((resolve, reject) => {
            ffmpeg(tempVideoFile)
                .audioCodec('libmp3lame')
                .save(tempAudioFile)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        });

        // Enviar o áudio
        const audio = MessageMedia.fromFilePath(tempAudioFile);
        await client.sendMessage(chatId, audio, { sendAudioAsVoice: true });

        console.log("✔️ Áudio enviado com sucesso.");

        // Apagar os arquivos temporários
        fs.unlinkSync(tempVideoFile);
        fs.unlinkSync(tempAudioFile);
        console.log("🗑️ Arquivos temporários removidos.");

    } catch (error) {
        console.error(`❌ Erro ao baixar o áudio: ${error.message}`);
        await client.sendMessage(chatId, '❌ Ocorreu um erro ao baixar o áudio. Tente novamente mais tarde.');
    }
};




module.exports = {
    processTikTokMedia,
    processKwaiMedia,
    downloadVideoFromYouTube,
    downloadAudioFromYouTube,
    searchYTFromApi,
    sendSearchResults,
    downloadAudioFromApi,
    downloadVideoFromApi,
};
