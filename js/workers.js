// js/workers.js

// --- IMPORTS ---
import * as state from './state.js';
import * as config from './config.js';

// Import specific UI functions needed, NOT the whole module
import { updateAiStatus, updateOptimizationStatus, showOptimizationComplete, showOptimizationStopped, toggleParameterSliders } from './ui.js'; // ADDED: toggleParameterSliders
import * as dom from './ui.js'; // Import dom elements from ui.js for button references


// --- WORKER INITIALIZATION ---
export let aiWorker;
export let optimizationWorker;

export function initializeWorkers() {
    // Corrected paths to point inside the /js folder
    aiWorker = new Worker('js/aiWorker.js', { type: 'module' });
    optimizationWorker = new Worker('js/optimizationWorker.js', { type: 'module' });

    // --- WORKER MESSAGE HANDLERS ---
    aiWorker.onmessage = (event) => {
        const { type, message, probabilities, payload } = event.data;
        if (config.DEBUG_MODE) console.log(`Main: Received from AI Worker: ${type}`);

        switch (type) {
            case 'status':
                updateAiStatus(message); 
                if (message.includes('Ready!')) {
                    state.setIsAiReady(true);
                } else if (message.includes('Training') || message.includes('failed')) {
                    state.setIsAiReady(false);
                }
                break;
            case 'predictionResult':
                // This is handled by a temporary listener in analysis.js
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
                const totalVariations = payload.maxGenerations * payload.populationSize;
                const progressHtml = `
                    Evolving... Gen: <strong>${payload.generation}/${payload.maxGenerations}</strong>
                    <br>Processed: <strong>${payload.processedCount} / ${totalVariations}</strong>
                    <br>Best W/L Ratio: <strong>${payload.bestFitness}</strong>
                `;
                updateOptimizationStatus(progressHtml);
                state.setBestFoundParams(payload); // Store the entire payload to include bestIndividual and togglesUsed
                break;
            case 'complete':
                showOptimizationComplete(payload);
                state.setBestFoundParams(payload); // Store the entire payload here as well
                break;
            case 'stopped':
                showOptimizationStopped();
                break;
            case 'error':
                const errorHtml = `<span style="color: #ef4444;"><strong>Error:</strong> ${payload.message}</span>`;
                updateOptimizationStatus(errorHtml);
                showOptimizationStopped();
                break;
        }
    };
    
}
