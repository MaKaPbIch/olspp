const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game state
let rooms = new Map();

// Helper function to get or create room
function getRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            id: roomId,
            participants: [],
            task: '',
            votesRevealed: false,
            clients: new Set()
        });
    }
    return rooms.get(roomId);
}

// Broadcast to all clients in a room
function broadcastToRoom(roomId, message, excludeClient = null) {
    const room = rooms.get(roomId);
    if (!room) return;

    const data = JSON.stringify(message);
    room.clients.forEach(client => {
        if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New client connected');
    let currentRoomId = null;
    let clientId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'join':
                    currentRoomId = data.roomId || 'default';
                    clientId = data.clientId;
                    const room = getRoom(currentRoomId);
                    room.clients.add(ws);

                    // Send current room state to the new client
                    ws.send(JSON.stringify({
                        type: 'roomState',
                        room: {
                            participants: room.participants,
                            task: room.task,
                            votesRevealed: room.votesRevealed
                        }
                    }));

                    console.log(`Client ${clientId} joined room ${currentRoomId}`);
                    break;

                case 'addParticipant':
                    if (currentRoomId) {
                        const room = getRoom(currentRoomId);
                        const participant = {
                            id: data.participant.id,
                            name: data.participant.name,
                            vote: null,
                            hasVoted: false,
                            clientId: data.participant.clientId
                        };
                        room.participants.push(participant);

                        broadcastToRoom(currentRoomId, {
                            type: 'participantAdded',
                            participant: participant
                        });
                    }
                    break;

                case 'removeParticipant':
                    if (currentRoomId) {
                        const room = getRoom(currentRoomId);
                        room.participants = room.participants.filter(p => p.id !== data.participantId);

                        broadcastToRoom(currentRoomId, {
                            type: 'participantRemoved',
                            participantId: data.participantId
                        });
                    }
                    break;

                case 'vote':
                    if (currentRoomId) {
                        const room = getRoom(currentRoomId);
                        const participant = room.participants.find(p => p.id === data.participantId);
                        if (participant) {
                            participant.vote = data.vote;
                            participant.hasVoted = true;

                            broadcastToRoom(currentRoomId, {
                                type: 'voteUpdated',
                                participantId: data.participantId,
                                vote: data.vote,
                                hasVoted: true
                            });
                        }
                    }
                    break;

                case 'updateTask':
                    if (currentRoomId) {
                        const room = getRoom(currentRoomId);
                        room.task = data.task;

                        broadcastToRoom(currentRoomId, {
                            type: 'taskUpdated',
                            task: data.task
                        }, ws);
                    }
                    break;

                case 'revealVotes':
                    if (currentRoomId) {
                        const room = getRoom(currentRoomId);
                        room.votesRevealed = data.revealed;

                        broadcastToRoom(currentRoomId, {
                            type: 'votesRevealed',
                            revealed: data.revealed
                        }, ws);
                    }
                    break;

                case 'resetVotes':
                    if (currentRoomId) {
                        const room = getRoom(currentRoomId);
                        room.participants.forEach(p => {
                            p.vote = null;
                            p.hasVoted = false;
                        });
                        room.votesRevealed = false;

                        broadcastToRoom(currentRoomId, {
                            type: 'votesReset'
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (currentRoomId) {
            const room = rooms.get(currentRoomId);
            if (room) {
                room.clients.delete(ws);

                // Remove participants associated with this client
                const disconnectedParticipants = room.participants.filter(p => p.clientId === clientId);
                disconnectedParticipants.forEach(p => {
                    room.participants = room.participants.filter(participant => participant.id !== p.id);
                    broadcastToRoom(currentRoomId, {
                        type: 'participantRemoved',
                        participantId: p.id
                    });
                });

                // Clean up empty rooms
                if (room.clients.size === 0) {
                    rooms.delete(currentRoomId);
                    console.log(`Room ${currentRoomId} deleted (empty)`);
                }
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        rooms: rooms.size,
        timestamp: new Date().toISOString()
    });
});

// Get room info
app.get('/api/rooms/:roomId', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (room) {
        res.json({
            id: room.id,
            participantCount: room.participants.length,
            task: room.task,
            votesRevealed: room.votesRevealed
        });
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎯 Scrum Planning Poker server running on port ${PORT}`);
    console.log(`📱 Open http://localhost:${PORT} in your browser`);
});
