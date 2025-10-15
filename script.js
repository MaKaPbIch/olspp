// Planning Poker values (Fibonacci sequence + special cards)
const cardValues = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'];

// State
let participants = [];
let currentVote = null;
let votesRevealed = false;
let ws = null;
let clientId = null;
let roomId = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Initialize the application
function init() {
    clientId = localStorage.getItem('clientId') || generateClientId();
    localStorage.setItem('clientId', clientId);

    // Get room ID from URL or use default
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room') || 'default';

    renderCards();
    attachEventListeners();
    connectWebSocket();
}

// Generate unique client ID
function generateClientId() {
    return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Connect to WebSocket server
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connected to server');
        reconnectAttempts = 0;

        // Join room
        ws.send(JSON.stringify({
            type: 'join',
            roomId: roomId,
            clientId: clientId
        }));

        updateConnectionStatus(true);
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };

    ws.onclose = () => {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
        attemptReconnect();
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Handle messages from server
function handleServerMessage(data) {
    switch (data.type) {
        case 'roomState':
            participants = data.room.participants.map(p => ({
                ...p,
                isCurrentUser: p.clientId === clientId
            }));
            votesRevealed = data.room.votesRevealed;
            document.getElementById('taskInput').value = data.room.task || '';

            if (votesRevealed) {
                document.getElementById('showVotes').textContent = 'Скрыть голоса';
                document.getElementById('resultsSection').style.display = 'block';
                calculateResults();
            }

            renderParticipants();
            break;

        case 'participantAdded':
            const existingParticipant = participants.find(p => p.id === data.participant.id);
            if (!existingParticipant) {
                participants.push({
                    ...data.participant,
                    isCurrentUser: data.participant.clientId === clientId
                });
                renderParticipants();
            }
            break;

        case 'participantRemoved':
            participants = participants.filter(p => p.id !== data.participantId);
            renderParticipants();
            if (votesRevealed) {
                calculateResults();
            }
            break;

        case 'voteUpdated':
            const participant = participants.find(p => p.id === data.participantId);
            if (participant) {
                participant.vote = data.vote;
                participant.hasVoted = data.hasVoted;
                renderParticipants();
            }
            break;

        case 'taskUpdated':
            document.getElementById('taskInput').value = data.task;
            break;

        case 'votesRevealed':
            votesRevealed = data.revealed;
            const btn = document.getElementById('showVotes');
            const resultsSection = document.getElementById('resultsSection');

            if (votesRevealed) {
                btn.textContent = 'Скрыть голоса';
                resultsSection.style.display = 'block';
                calculateResults();
            } else {
                btn.textContent = 'Показать голоса';
                resultsSection.style.display = 'none';
            }

            renderParticipants();
            break;

        case 'votesReset':
            participants.forEach(p => {
                p.vote = null;
                p.hasVoted = false;
            });
            currentVote = null;
            votesRevealed = false;

            document.getElementById('showVotes').textContent = 'Показать голоса';
            document.getElementById('resultsSection').style.display = 'none';

            document.querySelectorAll('.card').forEach(card => {
                card.classList.remove('selected');
            });

            renderParticipants();
            break;
    }
}

// Attempt to reconnect
function attemptReconnect() {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
        console.log(`Attempting to reconnect in ${delay}ms...`);
        setTimeout(connectWebSocket, delay);
    } else {
        console.error('Max reconnection attempts reached');
        alert('Потеряно соединение с сервером. Пожалуйста, обновите страницу.');
    }
}

// Update connection status indicator
function updateConnectionStatus(connected) {
    const header = document.querySelector('header');
    let statusIndicator = document.getElementById('connectionStatus');

    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.id = 'connectionStatus';
        statusIndicator.style.cssText = 'position: absolute; top: 10px; right: 10px; padding: 5px 10px; border-radius: 5px; font-size: 0.9em;';
        header.style.position = 'relative';
        header.appendChild(statusIndicator);
    }

    if (connected) {
        statusIndicator.textContent = '🟢 Подключено';
        statusIndicator.style.background = 'rgba(76, 175, 80, 0.3)';
    } else {
        statusIndicator.textContent = '🔴 Отключено';
        statusIndicator.style.background = 'rgba(244, 67, 54, 0.3)';
    }
}

// Send message to server
function sendToServer(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        console.error('WebSocket is not connected');
    }
}

// Render poker cards
function renderCards() {
    const cardsContainer = document.getElementById('cardsContainer');
    cardsContainer.innerHTML = '';

    cardValues.forEach(value => {
        const card = document.createElement('div');
        card.className = 'card';
        card.textContent = value;
        card.dataset.value = value;
        card.addEventListener('click', () => selectCard(value, card));
        cardsContainer.appendChild(card);
    });
}

// Select a card
function selectCard(value, cardElement) {
    // Remove selection from all cards
    document.querySelectorAll('.card').forEach(card => {
        card.classList.remove('selected');
    });

    // Select current card
    cardElement.classList.add('selected');
    currentVote = value;

    // Update current user's vote if exists
    updateCurrentUserVote(value);
}

// Update current user vote
function updateCurrentUserVote(value) {
    const currentUser = participants.find(p => p.isCurrentUser);
    if (currentUser) {
        sendToServer({
            type: 'vote',
            participantId: currentUser.id,
            vote: value
        });
    }
}

// Attach event listeners
function attachEventListeners() {
    document.getElementById('addParticipant').addEventListener('click', addParticipant);
    document.getElementById('showVotes').addEventListener('click', toggleVotes);
    document.getElementById('resetVotes').addEventListener('click', resetVotes);

    // Task input with debounce
    let taskTimeout;
    document.getElementById('taskInput').addEventListener('input', (e) => {
        clearTimeout(taskTimeout);
        taskTimeout = setTimeout(() => {
            sendToServer({
                type: 'updateTask',
                task: e.target.value
            });
        }, 500);
    });
}

// Add a new participant
function addParticipant() {
    const name = prompt('Введите имя участника:');
    if (name && name.trim()) {
        const participant = {
            id: Date.now(),
            name: name.trim(),
            vote: null,
            hasVoted: false,
            clientId: clientId
        };

        sendToServer({
            type: 'addParticipant',
            participant: participant
        });
    }
}

// Remove participant
function removeParticipant(id) {
    sendToServer({
        type: 'removeParticipant',
        participantId: id
    });
}

// Render participants list
function renderParticipants() {
    const participantsList = document.getElementById('participantsList');

    if (participants.length === 0) {
        participantsList.innerHTML = '<p style="text-align: center; color: #999;">Добавьте участников для начала голосования</p>';
        return;
    }

    participantsList.innerHTML = '';

    participants.forEach(participant => {
        const participantDiv = document.createElement('div');
        participantDiv.className = 'participant';
        if (participant.hasVoted) {
            participantDiv.classList.add('voted');
        }

        const infoDiv = document.createElement('div');
        infoDiv.className = 'participant-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'participant-name';
        nameDiv.textContent = participant.name + (participant.isCurrentUser ? ' (Вы)' : '');

        const voteDiv = document.createElement('div');
        voteDiv.className = 'participant-vote';

        if (!participant.hasVoted) {
            voteDiv.textContent = 'Ожидание голоса...';
        } else if (votesRevealed) {
            voteDiv.textContent = `Голос: ${participant.vote}`;
        } else {
            voteDiv.className = 'participant-vote hidden';
            voteDiv.textContent = 'Проголосовал ✓';
        }

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(voteDiv);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove';
        removeBtn.textContent = 'Удалить';
        removeBtn.addEventListener('click', () => removeParticipant(participant.id));

        participantDiv.appendChild(infoDiv);
        participantDiv.appendChild(removeBtn);
        participantsList.appendChild(participantDiv);
    });
}

// Toggle votes visibility
function toggleVotes() {
    if (!votesRevealed) {
        // Check if all participants have voted
        const allVoted = participants.length > 0 && participants.every(p => p.hasVoted);
        if (!allVoted && participants.length > 0) {
            if (!confirm('Не все участники проголосовали. Показать результаты?')) {
                return;
            }
        }
    }

    sendToServer({
        type: 'revealVotes',
        revealed: !votesRevealed
    });
}

// Calculate and display results
function calculateResults() {
    const votedParticipants = participants.filter(p => p.hasVoted && !isNaN(p.vote));

    if (votedParticipants.length === 0) {
        document.getElementById('avgValue').textContent = '-';
        document.getElementById('medianValue').textContent = '-';
        document.getElementById('consensusValue').textContent = '-';
        document.getElementById('votesDisplay').innerHTML = '<p>Нет голосов для подсчета</p>';
        return;
    }

    const votes = votedParticipants.map(p => parseFloat(p.vote)).sort((a, b) => a - b);

    // Calculate average
    const avg = votes.reduce((sum, vote) => sum + vote, 0) / votes.length;
    document.getElementById('avgValue').textContent = avg.toFixed(1);

    // Calculate median
    const mid = Math.floor(votes.length / 2);
    const median = votes.length % 2 === 0
        ? (votes[mid - 1] + votes[mid]) / 2
        : votes[mid];
    document.getElementById('medianValue').textContent = median;

    // Check consensus
    const uniqueVotes = [...new Set(votes)];
    const consensus = uniqueVotes.length === 1 ? 'Да ✓' : 'Нет';
    document.getElementById('consensusValue').textContent = consensus;

    // Display all votes
    const votesDisplay = document.getElementById('votesDisplay');
    votesDisplay.innerHTML = '';

    participants.forEach(participant => {
        if (participant.hasVoted) {
            const voteItem = document.createElement('div');
            voteItem.className = 'vote-item';
            voteItem.innerHTML = `
                <span class="vote-name">${participant.name}:</span>
                <span class="vote-value">${participant.vote}</span>
            `;
            votesDisplay.appendChild(voteItem);
        }
    });
}

// Reset all votes
function resetVotes() {
    if (!confirm('Сбросить все голоса?')) {
        return;
    }

    sendToServer({
        type: 'resetVotes'
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
