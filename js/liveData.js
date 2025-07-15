// js/liveData.js

import * as state from './state.js';
import { handleLiveSpin } from './analysis.js'; // Function to process each new live spin

// Important: Replace 'YOUR_BACKEND_WEBSOCKET_URL' with the actual URL of your Socket.IO server.
// If you are trying to connect to the 'logauto.js' server, you would use 'http://54.38.159.96'.
// However, direct access to this server for your own app might be restricted or require authentication.
// For development, if you set up a local Node.js server, it might be 'http://localhost:3000'.
const socket = io('http://54.38.159.96'); 

export function connectLiveDataSource() {
    socket.on('connect', () => {
        console.log('Connected to live data server.');
        // This is where you might send a message to the backend to request initial data or authenticate.
        // Similar to logauto.js's 'requestData' message
        // Example: socket.emit('requestInitialData', { token: state.getAuthToken() });
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from live data server.');
        // Update UI to show disconnection status
    });

    // Event listeners based on data structure observed in logauto.js and common live roulette feeds
    socket.on('pragmaticTablesUpdate', (data) => {
        // This event seems to provide updates for specific Pragmatic tables
        // data[0] is results, data[1] is table ID
        const tableId = data[1];
        const results = data[0]; // array of latest numbers, e.g., [winningNumber, prev1, prev2, ...]

        // For simplicity, let's assume `results` is [winningNumber, num2, num1, ...]
        // You'll need to adapt this parsing based on the actual structure your backend sends.
        if (results && results.length >= 3) {
            const winningNumber = Number(results[0]);
            const num2 = Number(results[1]); // The number before winningNumber
            const num1 = Number(results[2]); // The number before num2

            if (!isNaN(winningNumber) && !isNaN(num1) && !isNaN(num2)) {
                // Assuming only the currently selected live table should trigger analysis
                if (state.getCurrentLiveTableId() === tableId) {
                    handleLiveSpin(winningNumber, num1, num2);
                }
            }
            // Update UI for this specific table's latest numbers
            // ui.updateLiveTableNumbers(results.slice(0, 12)); // Assuming ui.js has such a function
        }
    });

    socket.on('lobby.historyUpdated', (data) => {
        // This event seems to provide updates for non-Pragmatic tables
        const tableIds = Object.keys(data.args); // e.g., data.args.['tableID'].results
        if (tableIds.length > 0) {
            const tableId = tableIds[0]; // Assuming only one table updated at a time for simplicity
            const results = data.args[tableId].results; // array of results objects [ {number: N}, {number: M} ]

            if (results && results.length >= 3) {
                const winningNumber = Number(results[0].number);
                const num2 = Number(results[1].number);
                const num1 = Number(results[2].number);

                if (!isNaN(winningNumber) && !isNaN(num1) && !isNaN(num2)) {
                    if (state.getCurrentLiveTableId() === tableId) {
                        handleLiveSpin(winningNumber, num1, num2);
                    }
                }
                // Update UI for this specific table's latest numbers
                // ui.updateLiveTableNumbers(results.slice(0, 12).map(r => r.number));
            }
        }
    });

    // You might also handle initial data for table listings
    socket.on('tablesDataPragmatic', (data) => {
        // This event provides initial data for pragmatic tables
        // data[0] is table names, data[1] is URLs, data[2] is history, data[3] is IDs
        const liveTablesMap = {};
        data[3].forEach((id, index) => {
            const tableName = data[0][id] || `Pragmatic Table ${id}`;
            // Construct a unique ID for state management if needed, e.g., 'pragmatic_' + id
            liveTablesMap['pragmatic_' + id] = {
                id: 'pragmatic_' + id,
                name: tableName,
                // You might store initial history for the table here
                // initialHistory: data[2][id]
            };
        });
        state.setLiveTables(liveTablesMap);
        // ui.renderLiveTables(liveTablesMap); // Assuming ui.js has a function to render these
    });

    socket.on('tablesData', (data) => {
        // This event handles initial lobby configs and histories for non-pragmatic tables
        if (data.type === 'lobby.configs') {
            const newLiveTables = { ...state.liveTables }; // Preserve pragmatic tables
            for (const tableId in data.args.configs) {
                newLiveTables[tableId] = { id: tableId, name: data.args.configs[tableId].title };
            }
            state.setLiveTables(newLiveTables);
            // ui.renderLiveTables(newLiveTables);
        } else if (data.type === 'lobby.histories') {
            // This provides initial histories for tables
            // You might iterate through data.args.histories and store them
        }
        // logauto.js also uses 'lobby.thumbnails' for table images - you could integrate that into your UI if desired.
    });

    // The logauto.js sends a requestData message on connect. You might need to replicate this
    // if your backend requires an explicit request to start sending data.
    // socket.emit('requestData', 'some_token_or_id_if_needed'); // Example
}