// Planning Poker values (Fibonacci sequence + special cards)
const cardValues = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'];

// State
let participants = [];
let currentVote = null;
let votesRevealed = false;
let ws = null;
let clientId = null;
let roomId = null;
let currentUserParticipant = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Initialize the application
function init() {
    clientId = localStorage.getItem('clientId') || generateClientId();
    localStorage.setItem('clientId', clientId);

    // Get room ID from URL or use default
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room') || 'default';

    // Check if user has a saved name
    const savedName = localStorage.getItem('userName');
    if (savedName) {
        // Auto-join with saved name
        hideRegistrationModal();
        connectWebSocket();
        setTimeout(() => {
            autoRegisterUser(savedName);
        }, 500);
    } else {
        // Show registration modal
        showRegistrationModal();
    }

    renderCards();
    attachEventListeners();
}

// Generate unique client ID
function generateClientId() {
    return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Show/hide registration modal
function showRegistrationModal() {
    document.getElementById('registerModal').classList.remove('hidden');
}

function hideRegistrationModal() {
    document.getElementById('registerModal').classList.add('hidden');
}

// Auto-register user
function autoRegisterUser(name) {
    const participant = {
        id: Date.now(),
        name: name,
        vote: null,
        hasVoted: false,
        clientId: clientId
    };

    currentUserParticipant = participant;
    document.getElementById('currentPlayerName').textContent = name;

    sendToServer({
        type: 'addParticipant',
        participant: participant
    });
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

            // Update current user participant
            currentUserParticipant = participants.find(p => p.isCurrentUser);
            if (currentUserParticipant) {
                document.getElementById('currentPlayerName').textContent = currentUserParticipant.name;
            }

            if (votesRevealed) {
                showResults();
            }

            renderParticipants();
            updateSelectedCard();
            break;

        case 'participantAdded':
            const existingParticipant = participants.find(p => p.id === data.participant.id);
            if (!existingParticipant) {
                const newParticipant = {
                    ...data.participant,
                    isCurrentUser: data.participant.clientId === clientId
                };
                participants.push(newParticipant);

                if (newParticipant.isCurrentUser) {
                    currentUserParticipant = newParticipant;
                    document.getElementById('currentPlayerName').textContent = newParticipant.name;
                }

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
                updateSelectedCard();
            }
            break;

        case 'taskUpdated':
            document.getElementById('taskInput').value = data.task;
            break;

        case 'votesRevealed':
            votesRevealed = data.revealed;
            if (votesRevealed) {
                showResults();
            } else {
                hideResults();
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

            document.querySelectorAll('.card').forEach(card => {
                card.classList.remove('selected', 'disabled');
            });

            document.getElementById('selectedCardDisplay').innerHTML = '';
            hideResults();
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
    let statusIndicator = document.getElementById('connectionStatus');

    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.id = 'connectionStatus';
        document.body.appendChild(statusIndicator);
    }

    if (connected) {
        statusIndicator.textContent = '🟢 Подключено';
        statusIndicator.style.background = 'rgba(76, 175, 80, 0.8)';
        statusIndicator.style.color = '#fff';
    } else {
        statusIndicator.textContent = '🔴 Отключено';
        statusIndicator.style.background = 'rgba(244, 67, 54, 0.8)';
        statusIndicator.style.color = '#fff';
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
        card.dataset.value = value;

        const cardValue = document.createElement('div');
        cardValue.className = 'card-value';
        cardValue.textContent = value;
        card.appendChild(cardValue);

        card.addEventListener('click', () => selectCard(value, card));
        cardsContainer.appendChild(card);
    });
}

// Select a card
function selectCard(value, cardElement) {
    if (!currentUserParticipant) return;

    // Remove selection from all cards
    document.querySelectorAll('.card').forEach(card => {
        card.classList.remove('selected');
    });

    // Select current card
    cardElement.classList.add('selected');
    currentVote = value;

    // Update selected card display
    updateSelectedCard();

    // Send vote to server
    sendToServer({
        type: 'vote',
        participantId: currentUserParticipant.id,
        vote: value
    });
}

// Update selected card display on table
function updateSelectedCard() {
    if (!currentUserParticipant || !currentUserParticipant.hasVoted) {
        document.getElementById('selectedCardDisplay').innerHTML = '';
        return;
    }

    const display = document.getElementById('selectedCardDisplay');
    display.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.value = currentUserParticipant.vote;

    const cardValue = document.createElement('div');
    cardValue.className = 'card-value';
    cardValue.textContent = currentUserParticipant.vote;
    card.appendChild(cardValue);

    display.appendChild(card);
}

// Attach event listeners
function attachEventListeners() {
    // Registration
    document.getElementById('joinButton').addEventListener('click', () => {
        const name = document.getElementById('usernameInput').value.trim();
        if (name) {
            localStorage.setItem('userName', name);
            hideRegistrationModal();
            connectWebSocket();
            setTimeout(() => {
                autoRegisterUser(name);
            }, 500);
        }
    });

    document.getElementById('usernameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('joinButton').click();
        }
    });

    // Reveal/Reset buttons
    document.getElementById('revealButton').addEventListener('click', toggleVotes);
    document.getElementById('resetButton').addEventListener('click', resetVotes);

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

// Render participants list
function renderParticipants() {
    const otherPlayersContainer = document.getElementById('otherPlayers');
    otherPlayersContainer.innerHTML = '';

    const otherParticipants = participants.filter(p => !p.isCurrentUser);

    if (otherParticipants.length === 0) {
        otherPlayersContainer.innerHTML = '<p style="color: #a0d4a8; text-align: center;">Ждем других игроков...</p>';
        return;
    }

    otherParticipants.forEach(participant => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        if (participant.hasVoted) {
            playerCard.classList.add('voted');
        }

        const playerName = document.createElement('div');
        playerName.className = 'player-name';
        playerName.textContent = participant.name;

        const playerStatus = document.createElement('div');
        playerStatus.className = 'player-status';

        if (!participant.hasVoted) {
            playerStatus.textContent = 'Думает...';
        } else if (votesRevealed) {
            playerStatus.textContent = 'Голос раскрыт';
        } else {
            playerStatus.textContent = '✓ Проголосовал';
        }

        playerCard.appendChild(playerName);
        playerCard.appendChild(playerStatus);

        // Show card
        if (votesRevealed && participant.hasVoted) {
            const cardReveal = document.createElement('div');
            cardReveal.className = 'player-card-revealed';
            cardReveal.textContent = participant.vote;
            playerCard.appendChild(cardReveal);
        } else if (participant.hasVoted) {
            const cardBack = document.createElement('div');
            cardBack.className = 'player-card-back';
            cardBack.textContent = '🎴';
            playerCard.appendChild(cardBack);
        }

        otherPlayersContainer.appendChild(playerCard);
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

// Show results panel
function showResults() {
    document.getElementById('resultsPanel').style.display = 'block';
    document.getElementById('revealButton').textContent = '🔒 Скрыть карты';
    calculateResults();
}

// Hide results panel
function hideResults() {
    document.getElementById('resultsPanel').style.display = 'none';
    document.getElementById('revealButton').textContent = '🔍 Показать карты';
}

// Calculate and display results
function calculateResults() {
    const votedParticipants = participants.filter(p => p.hasVoted && !isNaN(p.vote));

    if (votedParticipants.length === 0) {
        document.getElementById('avgValue').textContent = '-';
        document.getElementById('medianValue').textContent = '-';
        document.getElementById('consensusValue').textContent = '-';
        document.getElementById('allVotesDisplay').innerHTML = '<p style="text-align: center;">Нет голосов для подсчета</p>';
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
    const votesDisplay = document.getElementById('allVotesDisplay');
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
    if (!confirm('Начать новую игру? Все голоса будут сброшены.')) {
        return;
    }

    sendToServer({
        type: 'resetVotes'
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
