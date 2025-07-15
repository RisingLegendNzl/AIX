// js/main.js

// --- IMPORTS ---
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import * as analysis from './analysis.js';
import { initializeWorkers, rlWorker } from './workers.js'; // ADDED: rlWorker

// --- STATE MANAGEMENT ---
function loadState() {
    const savedState = localStorage.getItem('terminalCalculatorState');
    if (!savedState) {
        // No saved state, use defaults
        analysis.updateActivePredictionTypes();
        ui.updateAllTogglesUI();
        ui.initializeAdvancedSettingsUI();
        return;
    }

    const appState = JSON.parse(savedState);
    
    const newHistory = (appState.history || []).map(item => ({
        ...item,
        recommendedGroupId: item.recommendedGroupId || null,
        recommendedGroupPocketDistance: item.recommendedGroupPocketDistance ?? null,
        recommendationDetails: item.recommendationDetails || null,
        failureMode: item.failureMode || 'none' // Ensure failureMode is loaded
    }));
    state.setHistory(newHistory);
    state.setConfirmedWinsLog(appState.confirmedWinsLog || []);

    if (appState.TOGGLES) {
        state.setToggles(appState.TOGGLES);
    }
    if (appState.strategyStates) state.setStrategyStates(appState.strategyStates);
    if (appState.patternMemory) state.setPatternMemory(appState.patternMemory);
    if (appState.adaptiveFactorInfluences) Object.assign(state.adaptiveFactorInfluences, appState.adaptiveFactorInfluences); // Ensure this is merged, not overwritten
    if (appState.STRATEGY_CONFIG) Object.assign(config.STRATEGY_CONFIG, appState.STRATEGY_CONFIG);
    if (appState.ADAPTIVE_LEARNING_RATES) {
        Object.assign(config.ADAPTIVE_LEARNING_RATES, appState.ADAPTIVE_LEARNING_RATES);
        // Ensure FAILURE_MULTIPLIERS are correctly merged if they exist in saved state
        if (appState.ADAPTIVE_LEARNING_RATES.FAILURE_MULTIPLIERS) {
            Object.assign(config.ADAPTIVE_LEARNING_RATES.FAILURE_MULTIPLIERS, appState.ADAPTIVE_LEARNING_RATES.FAILURE_MULTIPLIERS);
        }
    }
    // NEW: Load ADAPTIVE_LEARNING_RATES_OVERRIDE if it exists
    if (appState.ADAPTIVE_LEARNING_RATES_OVERRIDE) {
        state.setAdaptiveLearningRatesOverride(appState.ADAPTIVE_LEARNING_RATES_OVERRIDE);
    }

    analysis.updateActivePredictionTypes();
    ui.updateAllTogglesUI();
    ui.initializeAdvancedSettingsUI();
}


// --- APPLICATION INITIALIZATION ---

// The script is loaded with type="module", which defers execution until the DOM is parsed.
// So, we can run our initialization code directly.

// 1. Initialize the UI (get DOM elements, attach listeners)
ui.initializeUI();

// 2. Load any saved state from localStorage
loadState();

// 3. Initialize the Web Workers and their message handlers
initializeWorkers();

// 4. Run the initial analyses and render the UI based on loaded state
analysis.runAllAnalyses();
ui.renderHistory();

// 5. Initialize the AI worker correctly, giving it time to load its resources
analysis.initializeAi();

// NEW: Attach optimization button listeners *after* workers are initialized
ui.attachOptimizationButtonListeners(); // FIXED: Call the new function here

// NEW: Initialize RL Worker (send initial config)
if (config.RL_CONFIG.enabled && rlWorker) {
    rlWorker.postMessage({
        type: 'init',
        payload: {
            config: config.RL_CONFIG,
            currentAdaptiveRates: state.getEffectiveAdaptiveLearningRates() // Send initial rates
        }
    });
}


// Read initial values directly for startup sequence
const initialNum1 = parseInt(document.getElementById('number1').value, 10);
const initialNum2 = parseInt(document.getElementById('number2').value, 10);
const lastWinningOnLoad = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;

if (!isNaN(initialNum1) && !isNaN(initialNum2)) {
    ui.drawRouletteWheel(Math.abs(initialNum2 - initialNum1), lastWinningOnLoad);
} else {
    ui.drawRouletteWheel(null, lastWinningOnLoad);
}

console.log("Application initialized using modular structure.");
