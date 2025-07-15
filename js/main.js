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
    
    // Ensure failureMode is initialized for older history items
    const newHistory = (appState.history || []).map(item => ({
        ...item,
        recommendedGroupId: item.recommendedGroupId || null,
        recommendedGroupPocketDistance: item.recommendedGroupPocketDistance ?? null,
        recommendationDetails: item.recommendationDetails || null,
        failureMode: item.failureMode || 'normalLoss' // Default for old items
    }));
    state.setHistory(newHistory);
    state.setConfirmedWinsLog(appState.confirmedWinsLog || []);

    if (appState.TOGGLES) {
        state.setToggles(appState.TOGGLES);
    }
    if (appState.strategyStates) state.setStrategyStates(appState.strategyStates);
    if (appState.patternMemory) state.setPatternMemory(appState.patternMemory);
    if (appState.adaptiveFactorInfluences) Object.assign(state.adaptiveFactorInfluences, appState.adaptiveFactorInfluences);
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
analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));
analysis.runAllAnalyses();
ui.renderHistory();

// 5. Initialize the AI worker correctly, giving it time to load its resources
analysis.initializeAi();

// 6. Trigger the Trend Worker to perform an initial analysis on the loaded history
analysis.triggerTrendAnalysis();

// 7. Attach optimization button listeners *after* workers are initialized
ui.attachOptimizationButtonListeners();

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
