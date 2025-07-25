const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const SAVE_FILE = path.join(__dirname, 'game_state.json');
const roles = [
    'Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 
    'Assassin', 'Morgana', 'Mordred', 'Oberon', 'Minion'
];

// Constants for game rules
const REQUIRED_TEAM_SIZES = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5]
};

// Initialize game state
let gameState = {
    players: [],
    gameStarted: false,
    assignedRoles: {},
    currentPhase: 'lobby',
    currentLeaderIndex: 0,
    currentTeam: [],
    teamVotes: {},
    missionVotes: {},
    missionResults: []
};

// Utility functions
function loadGameState() {
    try {
        if (fs.existsSync(SAVE_FILE)) {
            const data = fs.readFileSync(SAVE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading game state:', err);
    }
    return {
        players: [],
        gameStarted: false,
        assignedRoles: {},
        currentPhase: 'lobby',
        currentLeaderIndex: 0,
        currentTeam: [],
        teamVotes: {},
        missionVotes: {},
        missionResults: []
    };
}

function saveGameState() {
    try {
        fs.writeFileSync(SAVE_FILE, JSON.stringify(gameState, null, 2));
        console.log('Game state saved');
    } catch (err) {
        console.error('Error saving game state:', err);
    }
}

function ensurePlayerListConsistency() {
    gameState.players = gameState.players.filter(
        (player, index, self) => index === self.findIndex(p => p.name === player.name)
    );
    gameState.players.forEach(player => {
        player.connected = player.connected || false;
        player.lastSeen = player.lastSeen || moment().format();
    });
}

function broadcastGameState() {
    ensurePlayerListConsistency();
    gameState.players.forEach(player => {
        if (player.connected && io.sockets.sockets.get(player.socketId)) {
            io.to(player.socketId).emit('game-state', {
                playerName: player.name,
                role: gameState.assignedRoles[player.name],
                gameState: gameState
            });
        }
    });
}

// Initialize server
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

// Load initial state
gameState = loadGameState();

// Set up periodic saving
setInterval(saveGameState, 30000);

// Socket.io connection handler
io.on('connection', (socket) => {
    console.log('New connection:', socket.id);
    
    // Handle reconnection
    socket.on('reconnect-player', (name) => {
        const existingPlayer = gameState.players.find(p => p.name === name);
        if (existingPlayer) {
            existingPlayer.socketId = socket.id;
            existingPlayer.connected = true;
            existingPlayer.lastSeen = moment().format();
            
            io.emit('player-reconnected', {
                name: existingPlayer.name,
                gameState: gameState
            });
            
            socket.emit('initial-state', {
                players: gameState.players.map(p => ({
                    name: p.name,
                    connected: p.connected,
                    lastSeen: p.lastSeen
                })),
                gameState: gameState
            });
            
            console.log(`Player reconnected: ${name}`);
            saveGameState();
        }
    });
    
    socket.on('join', (name) => {
        if (gameState.gameStarted) {
            socket.emit('error', 'Game has already started');
            return;
        }
        
        if (gameState.players.some(p => p.name === name)) {
            socket.emit('error', 'Name already taken');
            return;
        }
        
        const player = { 
            name, 
            socketId: socket.id,
            connected: true,
            joinedAt: moment().format(),
            lastSeen: moment().format()
        };
        
        gameState.players.push(player);
        
        socket.emit('initial-state', {
            players: gameState.players.map(p => ({
                name: p.name,
                connected: p.connected,
                lastSeen: p.lastSeen
            })),
            gameState: gameState
        });
        
        socket.broadcast.emit('player-joined', {
            name: name,
            players: gameState.players.map(p => ({
                name: p.name,
                connected: p.connected,
                lastSeen: p.lastSeen
            }))
        });
        
        io.emit('players-updated', {
            players: gameState.players.map(p => p.name),
            fullPlayerData: gameState.players.map(p => ({
                name: p.name,
                connected: p.connected,
                lastSeen: p.lastSeen
            }))
        });
        
        saveGameState();
        console.log(`New player joined: ${name}`);
    });
    
    socket.on('disconnect', () => {
        const player = gameState.players.find(p => p.socketId === socket.id);
        if (player) {
            player.connected = false;
            player.lastSeen = moment().format();
            
            io.emit('player-left', {
                name: player.name,
                players: gameState.players.map(p => ({
                    name: p.name,
                    connected: p.connected,
                    lastSeen: p.lastSeen
                }))
            });
            
            console.log(`Player disconnected: ${player.name}`);
            saveGameState();
        }
    });

    // Add your other game event handlers here...
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
