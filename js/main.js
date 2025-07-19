// js/main.js

// --- IMPORTS ---
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import * as analysis from './analysis.js';
import { initializeWorkers } from './workers.js';

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
        recommendationDetails: item.recommendationDetails || null
    }));
    state.setHistory(newHistory);
    state.setConfirmedWinsLog(appState.confirmedWinsLog || []);

    // Load currentPendingCalculationId
    if (appState.currentPendingCalculationId !== undefined) {
        // Validate if the loaded ID actually points to a pending item in the loaded history
        const foundPendingItem = newHistory.find(
            item => item.id === appState.currentPendingCalculationId && item.status === 'pending' && item.winningNumber === null
        );
        if (foundPendingItem) {
            state.setCurrentPendingCalculationId(appState.currentPendingCalculationId);
        } else {
            // If the ID is invalid or doesn't match a pending item, reset it to null
            state.setCurrentPendingCalculationId(null);
            console.warn("Loaded currentPendingCalculationId did not match a valid pending item in history. Resetting ID.");
        }
    } else {
        state.setCurrentPendingCalculationId(null); // Ensure it's null if not in saved state
    }


    if (appState.TOGGLES) {
        state.setToggles(appState.TOGGLES);
    }
    if (appState.strategyStates) state.setStrategyStates(appState.strategyStates);
    if (appState.patternMemory) state.setPatternMemory(appState.patternMemory);
    if (appState.adaptiveFactorInfluences) Object.assign(state.adaptiveFactorInfluences, appState.adaptiveFactorInfluences); // Ensure this is merged, not overwritten
    if (appState.STRATEGY_CONFIG) Object.assign(config.STRATEGY_CONFIG, appState.STRATEGY_CONFIG);
    if (appState.ADAPTIVE_LEARNING_RATES) Object.assign(config.ADAPTIVE_LEARNING_RATES, appState.ADAPTIVE_LEARNING_RATES);

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

// NEW: Call updateMainRecommendationDisplay explicitly on initial load to show current recommendation
ui.updateMainRecommendationDisplay(); //

// 5. Initialize the AI worker correctly, giving it time to load its resources
analysis.initializeAi();

// NEW: Attach optimization button listeners *after* workers are initialized
ui.attachOptimizationButtonListeners(); // FIXED: Call the new function here

// Read initial values directly for startup sequence
const initialNum1 = parseInt(document.getElementById('number1').value, 10);
const initialNum2 = parseInt(document.getElementById('number2').value, 10);
const lastWinningOnLoad = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;

// This will now be handled by updateMainRecommendationDisplay, but keep for clarity if inputs are empty
if (!isNaN(initialNum1) && !isNaN(initialNum2)) {
    ui.drawRouletteWheel(Math.abs(initialNum2 - initialNum1), lastWinningOnLoad);
} else {
    ui.drawRouletteWheel(null, lastWinningOnLoad);
}

console.log("Application initialized using modular structure.");
