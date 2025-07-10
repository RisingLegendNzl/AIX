// js/workers.js

// --- IMPORTS ---
import * as state from './state.js';
import * as config from './config.js';

// Import specific UI functions needed, NOT the whole module
import { updateAiStatus, updateOptimizationStatus, showOptimizationComplete, showOptimizationStopped } from './ui.js';

// --- WORKER INITIALIZATION ---
export let aiWorker;
export let optimizationWorker;

export function initializeWorkers() {
    // Ensure workers are in the root directory relative to index.html
    aiWorker = new Worker('aiWorker.js', { type: 'module' });
    optimizationWorker = new Worker('optimizationWorker.js', { type: 'module' });

    // --- WORKER MESSAGE HANDLERS ---
    aiWorker.onmessage = (event) => {
        const { type, message, probabilities, payload } = event.data;
        if (config.DEBUG_MODE) console.log(`Main: Received from AI Worker: ${type}`);

        switch (type) {
            case 'status':
                // Use the imported UI function to update the status
                updateAiStatus(message); 
                if (message.includes('Ready!')) {
                    state.setIsAiReady(true);
                } else if (message.includes('Training') || message.includes('failed')) {
                    state.setIsAiReady(false);
                }
                break;
            case 'predictionResult':
                // This would be where you handle incoming predictions
                break;
            case 'saveScaler':
                localStorage.setItem('roulette-ml-scaler', payload);
                break;
        }
    };

    optimizationWorker.onmessage = (event) => {
        const { type, payload } = event.data;

        switch (type) {
            case 'progress':
                const progressHtml = `Evolving... Gen: <strong>${payload.generation}/${payload.maxGenerations}</strong><br>Best W/L Ratio: <strong>${payload.bestFitness}</strong>`;
                updateOptimizationStatus(progressHtml);
                state.setBestFoundParams(payload.bestIndividual);
                break;
            case 'complete':
                showOptimizationComplete(payload);
                state.setBestFoundParams(payload.bestIndividual);
                break;
            case 'stopped':
                showOptimizationStopped();
                break;
        }
    };

} //
