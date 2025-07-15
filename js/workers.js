// js/workers.js

// --- IMPORTS ---
import * as state from './state.js';
import * as config from './config.js';

// Import specific UI functions needed, NOT the whole module
import { 
    updateAiStatus, 
    updateOptimizationStatus, 
    showOptimizationComplete, 
    showOptimizationStopped, 
    toggleParameterSliders,
    renderTrendAnalysis 
} from './ui.js';
import * as dom from './ui.js';


// --- WORKER INITIALIZATION ---
export let aiWorker;
export let optimizationWorker;
export let trendWorker;

export function initializeWorkers() {
    // Corrected paths to point inside the /js folder
    aiWorker = new Worker('js/aiWorker.js', { type: 'module' });
    optimizationWorker = new Worker('js/optimizationWorker.js', { type: 'module' });
    trendWorker = new Worker('js/trendWorker.js', { type: 'module' });

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
                state.setBestFoundParams(payload);
                break;
            case 'complete':
                showOptimizationComplete(payload);
                state.setBestFoundParams(payload);
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
    
    trendWorker.onmessage = (event) => {
        const { type, payload } = event.data;
        if (config.DEBUG_MODE) console.log(`Main: Received from Trend Worker: ${type}`);

        switch (type) {
            case 'trendReport':
                // Update the central state with the new analysis
                state.setTrendWorkerAnalysis(payload);
                // Render the new UI component with the analysis payload
                renderTrendAnalysis(payload);
                if (config.DEBUG_MODE) {
                    console.log('Trend Analysis Report Updated:', payload);
                }
                break;
        }
    };
}
