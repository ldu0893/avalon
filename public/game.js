const socket = io();
let playerName = '';
let myRole = '';
let currentGameState = {};
let connectionTimeout = null;

// Initialize moment.js (make sure it's included in your HTML)
function formatLastSeen(timestamp) {
    if (!timestamp) return 'a while ago';
    return moment(timestamp).fromNow();
}

// Connection monitoring
function setupConnectionMonitoring() {
    setInterval(() => {
        if (!socket.connected) {
            showDisconnectedWarning();
        }
    }, 5000);
    
    socket.on('reconnect', () => {
        hideDisconnectedWarning();
        if (playerName) {
            socket.emit('reconnect-player', playerName);
        }
    });
    
    socket.on('disconnect', () => {
        showDisconnectedWarning();
    });
}

function showDisconnectedWarning() {
    let warning = document.getElementById('connection-warning');
    if (!warning) {
        warning = document.createElement('div');
        warning.id = 'connection-warning';
        warning.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 10px;
            background: #ffcccc;
            border: 1px solid #ff0000;
            border-radius: 5px;
            z-index: 1000;
        `;
        document.body.appendChild(warning);
    }
    warning.textContent = 'Connection lost';
    warning.style.display = 'block';
    
    if (connectionTimeout) clearTimeout(connectionTimeout);
    connectionTimeout = setTimeout(() => {
        warning.textContent = 'Attempting to reconnect...';
    }, 5000);
}

function hideDisconnectedWarning() {
    const warning = document.getElementById('connection-warning');
    if (warning) warning.style.display = 'none';
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const container = document.getElementById('notification-container') || 
        createNotificationContainer();
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
    `;
    document.body.appendChild(container);
    return container;
}

// Player list management
function updatePlayerListUI(players) {
    const playersDiv = document.getElementById('players');
    if (!playersDiv) return;
    
    playersDiv.innerHTML = '';
    
    players.forEach(player => {
        const playerName = typeof player === 'string' ? player : player.name;
        const isConnected = typeof player === 'object' ? player.connected : true;
        const lastSeen = typeof player === 'object' ? player.lastSeen : null;
        
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player';
        
        const statusIcon = document.createElement('span');
        statusIcon.className = `status-icon ${isConnected ? 'connected' : 'disconnected'}`;
        statusIcon.title = isConnected ? 'Online' : `Offline (last seen ${formatLastSeen(lastSeen)})`;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = playerName;
        
        playerDiv.appendChild(statusIcon);
        playerDiv.appendChild(nameSpan);
        
        if (!isConnected) {
            playerDiv.classList.add('disconnected-player');
        }
        
        playersDiv.appendChild(playerDiv);
    });
}

// Event handlers
socket.on('initial-state', ({ players, gameState }) => {
    currentGameState = gameState || {};
    updatePlayerListUI(players);
    
    if (gameState && gameState.gameStarted) {
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('game-area').classList.remove('hidden');
        updateGameUI();
    }
});

socket.on('player-joined', ({ name, players }) => {
    showNotification(`${name} joined the game`, 'success');
    updatePlayerListUI(players);
});

socket.on('player-left', ({ name, players }) => {
    showNotification(`${name} left the game`, 'warning');
    updatePlayerListUI(players);
});

socket.on('player-reconnected', ({ name }) => {
    showNotification(`${name} reconnected`, 'info');
});

socket.on('players-updated', ({ players, fullPlayerData }) => {
    const playersToDisplay = fullPlayerData || players.map(name => ({ name }));
    updatePlayerListUI(playersToDisplay);
    
    const firstPlayerName = players.length > 0 ? players[0] : '';
    document.getElementById('start-game').disabled = 
        currentGameState.gameStarted || firstPlayerName !== playerName;
});

socket.on('game-state', ({ playerName: pName, role, gameState }) => {
    if (pName !== playerName) return;
    
    myRole = role;
    currentGameState = gameState;
    updateGameUI();
});

// Game UI functions
function updateGameUI() {
    document.getElementById('role-info').innerHTML = `
        <h3>You are: ${myRole}</h3>
        ${shouldShowLoyaltyInfo() ? `<p>You are ${isEvilRole(myRole) ? 'Evil' : 'Good'}</p>` : ''}
    `;
    
    updateMissionHistoryUI();
    
    switch (currentGameState.currentPhase) {
        case 'team-selection':
            renderTeamSelectionPhase();
            break;
        case 'team-voting':
            renderTeamVotingPhase();
            break;
        case 'mission':
            renderMissionPhase();
            break;
        case 'assassination':
            renderAssassinationPhase();
            break;
        case 'game-over':
            renderGameOver();
            break;
    }
    
    if (myRole === 'Percival') {
        showPercivalInfo();
    } else if (myRole === 'Merlin') {
        showMerlinInfo();
    } else if (isEvilRole(myRole)) {
        showEvilInfo();
    }
}

function isEvilRole(role) {
    return ['Assassin', 'Morgana', 'Mordred', 'Oberon', 'Minion'].includes(role);
}

function shouldShowLoyaltyInfo() {
    return !['Mordred', 'Oberon'].includes(myRole);
}

function showPercivalInfo() {
    const merlin = Object.entries(currentGameState.assignedRoles).find(([_, r]) => r === 'Merlin');
    const morgana = Object.entries(currentGameState.assignedRoles).find(([_, r]) => r === 'Morgana');
    
    const infoDiv = document.getElementById('role-info');
    infoDiv.innerHTML += `
        <div class="special-info">
            <h4>As Percival, you see:</h4>
            <p>${merlin[0]} (Merlin)</p>
            ${morgana ? `<p>${morgana[0]} (Morgana)</p>` : ''}
        </div>
    `;
}

function showMerlinInfo() {
    const evilPlayers = Object.entries(currentGameState.assignedRoles)
        .filter(([_, r]) => isEvilRole(r) && r !== 'Mordred')
        .map(([name]) => name);
    
    const infoDiv = document.getElementById('role-info');
    infoDiv.innerHTML += `
        <div class="special-info">
            <h4>As Merlin, you see these Evil players:</h4>
            <ul>
                ${evilPlayers.map(name => `<li>${name}</li>`).join('')}
            </ul>
        </div>
    `;
}

function showEvilInfo() {
    const evilPlayers = Object.entries(currentGameState.assignedRoles)
        .filter(([_, r]) => isEvilRole(r) && r !== 'Oberon')
        .map(([name, role]) => `${name} (${role})`);
    
    const infoDiv = document.getElementById('role-info');
    infoDiv.innerHTML += `
        <div class="special-info">
            <h4>As ${myRole}, you know these Evil players:</h4>
            <ul>
                ${evilPlayers.map(info => `<li>${info}</li>`).join('')}
            </ul>
        </div>
    `;
}

function updateMissionHistoryUI() {
    const missionHistory = document.getElementById('mission-history') || 
        createMissionHistoryElement();
    let html = '<h4>Mission History</h4><ul>';
    
    (currentGameState.missionHistory || []).forEach((result, i) => {
        html += `<li>Mission ${i + 1}: ${result.success ? '✅' : '❌'}`;
        if (result.leader) html += ` (Leader: ${result.leader})`;
        if (result.team) html += ` [Team: ${result.team.join(', ')}]`;
        html += '</li>';
    });
    
    html += '</ul>';
    missionHistory.innerHTML = html;
}

function createMissionHistoryElement() {
    const div = document.createElement('div');
    div.id = 'mission-history';
    document.getElementById('game-area').appendChild(div);
    return div;
}

// Game phase rendering functions
function renderTeamSelectionPhase() {
    const actionsDiv = document.getElementById('actions');
    const leader = currentGameState.players[currentGameState.currentLeaderIndex];
    const requiredSize = REQUIRED_TEAM_SIZES[currentGameState.players.length][currentGameState.currentMission || 0];
    
    if (leader && leader.socketId === socket.id) {
        actionsDiv.innerHTML = `
            <h4>Select ${requiredSize} players for the mission (You are the leader)</h4>
            <div id="team-selection">
                ${currentGameState.players.map(player => `
                    <label>
                        <input type="checkbox" value="${player.name}" 
                               ${currentGameState.currentTeam?.includes(player.name) ? 'checked' : ''}>
                        ${player.name}
                    </label>
                `).join('')}
            </div>
            <button id="submit-team">Submit Team</button>
        `;
        
        document.getElementById('submit-team').addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#team-selection input:checked');
            const team = Array.from(checkboxes).map(cb => cb.value);
            socket.emit('propose-team', team);
        });
    } else {
        actionsDiv.innerHTML = `
            <h4>Waiting for ${leader?.name || 'the leader'} to select a team of ${requiredSize} players</h4>
            ${currentGameState.currentTeam?.length > 0 ? `
                <p>Proposed team: ${currentGameState.currentTeam.join(', ')}</p>
            ` : ''}
        `;
    }
}

function renderTeamVotingPhase() {
    const actionsDiv = document.getElementById('actions');
    
    if (!currentGameState.teamApprovalVotes[playerName]) {
        actionsDiv.innerHTML = `
            <h4>Vote on the proposed team: ${currentGameState.currentTeam?.join(', ') || ''}</h4>
            <button class="vote-btn" data-vote="true">Approve</button>
            <button class="vote-btn" data-vote="false">Reject</button>
        `;
        
        document.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const vote = btn.dataset.vote === 'true';
                socket.emit('submit-team-vote', { vote });
            });
        });
    } else {
        actionsDiv.innerHTML = `
            <h4>You voted to ${currentGameState.teamApprovalVotes[playerName] ? 'approve' : 'reject'} the team</h4>
            <p>Waiting for all players to vote...</p>
        `;
    }
}

function renderMissionPhase() {
    const actionsDiv = document.getElementById('actions');
    
    if (currentGameState.currentTeam?.includes(playerName)) {
        if (!currentGameState.missionVotes[playerName]) {
            const isEvil = isEvilRole(myRole);
            const canFail = isEvil && (currentGameState.currentMission !== 3 || currentGameState.players.length < 7);
            
            actionsDiv.innerHTML = `
                <h4>You are on the mission team</h4>
                <p>${canFail ? 'Choose to succeed or fail the mission:' : 'Mission requires success votes only'}</p>
                <button class="mission-vote" data-vote="true">Success</button>
                ${canFail ? `<button class="mission-vote" data-vote="false">Fail</button>` : ''}
            `;
            
            document.querySelectorAll('.mission-vote').forEach(btn => {
                btn.addEventListener('click', () => {
                    const vote = btn.dataset.vote === 'true';
                    socket.emit('submit-mission-vote', { vote });
                });
            });
        } else {
            actionsDiv.innerHTML = `
                <h4>You voted to ${currentGameState.missionVotes[playerName] ? 'succeed' : 'fail'} the mission</h4>
                <p>Waiting for all team members to vote...</p>
            `;
        }
    } else {
        actionsDiv.innerHTML = `
            <h4>Mission in progress</h4>
            <p>Team: ${currentGameState.currentTeam?.join(', ') || ''}</p>
            <p>Waiting for results...</p>
        `;
    }
}

function renderAssassinationPhase() {
    const actionsDiv = document.getElementById('actions');
    
    if (myRole === 'Assassin') {
        if (!currentGameState.assassinationTarget) {
            const potentialTargets = currentGameState.players
                .filter(player => 
                    !isEvilRole(currentGameState.assignedRoles[player.name]) &&
                    player.name !== 'Percival');
            
            actionsDiv.innerHTML = `
                <h4>Choose Merlin to assassinate</h4>
                <div id="assassination-targets">
                    ${potentialTargets.map(player => `
                        <button class="assassinate-btn" data-target="${player.name}">
                            ${player.name}
                        </button>
                    `).join('')}
                </div>
            `;
            
            document.querySelectorAll('.assassinate-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    socket.emit('assassinate', { target: btn.dataset.target });
                });
            });
        } else {
            actionsDiv.innerHTML = `
                <h4>You chose to assassinate ${currentGameState.assassinationTarget}</h4>
                <p>Waiting to see if Evil wins...</p>
            `;
        }
    } else {
        actionsDiv.innerHTML = `
            <h4>Waiting for Assassin to choose Merlin...</h4>
        `;
    }
}

function renderGameOver() {
    const actionsDiv = document.getElementById('actions');
    const winner = currentGameState.winner;
    
    actionsDiv.innerHTML = `
        <h2>Game Over!</h2>
        <h3>${winner === 'good' ? 'Good' : 'Evil'} wins!</h3>
        <div class="revealed-roles">
            <h4>All roles:</h4>
            <ul>
                ${currentGameState.players.map(player => `
                    <li>${player.name}: ${currentGameState.assignedRoles[player.name]}</li>
                `).join('')}
            </ul>
        </div>
        <button id="new-game">Start New Game</button>
    `;
    
    document.getElementById('new-game').addEventListener('click', () => {
        socket.emit('new-game');
    });
}

// Constants for client-side use
const REQUIRED_TEAM_SIZES = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5]
};

// Initialization
window.addEventListener('load', () => {
    setupConnectionMonitoring();
    
    const savedName = localStorage.getItem('avalon-player-name');
    if (savedName) {
        playerName = savedName;
        document.getElementById('player-name').value = playerName;
        socket.emit('reconnect-player', playerName);
    }
});

document.getElementById('join-game').addEventListener('click', () => {
    playerName = document.getElementById('player-name').value.trim();
    if (playerName) {
        localStorage.setItem('avalon-player-name', playerName);
        socket.emit('join', playerName);
        document.getElementById('login').classList.add('hidden');
        document.getElementById('lobby').classList.remove('hidden');
    }
});

// Testing controls (remove in production)
document.body.innerHTML += `
    <div style="position:fixed; bottom:10px; right:10px; z-index:1000; background:white; padding:10px; border:1px solid #ccc;">
        <h3>Test Controls</h3>
        <button onclick="simulateJoin('TestPlayer')">Add Test Player</button>
        <button onclick="simulateDisconnect()">Simulate Disconnect</button>
        <button onclick="simulateRefresh()">Simulate Refresh</button>
    </div>
`;

window.simulateJoin = (name) => {
    const playerName = name || `TestPlayer${Math.floor(Math.random()*1000)}`;
    socket.emit('join', playerName);
    showNotification(`Test player ${playerName} joined`, 'info');
};

window.simulateDisconnect = () => {
    socket.disconnect();
    showNotification('Simulated disconnect', 'warning');
};

window.simulateRefresh = () => {
    showNotification('Simulating refresh...', 'info');
    setTimeout(() => location.reload(), 1000);
};
