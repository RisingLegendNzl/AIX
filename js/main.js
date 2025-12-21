// js/main.js

// --- IMPORTS ---
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import * as analysis from './analysis.js';
import { initializeWorkers } from './workers.js';

// --- STATE MANAGEMENT ---
function loadState() {
    console.log("main.js: loadState started.");
    const savedState = localStorage.getItem('terminalCalculatorState');
    if (!savedState) {
        console.log("main.js: No saved state found. Using defaults.");
        // No saved state, use defaults
        analysis.updateActivePredictionTypes();
        ui.updateAllTogglesUI();
        ui.initializeAdvancedSettingsUI();
        return;
    }

    const appState = JSON.parse(savedState);
    console.log("main.js: Loaded appState from localStorage:", appState);
    
    const newHistory = (appState.history || []).map(item => ({
        ...item,
        recommendedGroupId: item.recommendedGroupId || null,
        recommendedGroupPocketDistance: item.recommendedGroupPocketDistance ?? null,
        recommendationDetails: item.recommendationDetails || null
    }));
    state.setHistory(newHistory);
    state.setConfirmedWinsLog(appState.confirmedWinsLog || []);

    // Load historical maximums
    if (appState.historicalMaximums) {
        state.setHistoricalMaximums(appState.historicalMaximums);
        console.log("main.js: Loaded historical maximums from state");
    } else {
        // Initialize empty historical maximums if not present
        state.setHistoricalMaximums({});
        console.log("main.js: Initialized empty historical maximums");
    }

    // Load currentPendingCalculationId
    if (appState.currentPendingCalculationId !== undefined) {
        // Validate if the loaded ID actually points to a pending item in the loaded history
        const foundPendingItem = newHistory.find(
            item => item.id === appState.currentPendingCalculationId && item.status === 'pending' && item.winningNumber === null
        );
        if (foundPendingItem) {
            state.setCurrentPendingCalculationId(appState.currentPendingCalculationId);
            console.log(`main.js: Successfully loaded and validated currentPendingCalculationId: ${appState.currentPendingCalculationId}`);
        } else {
            // If the ID is invalid or doesn't match a pending item, reset it to null
            state.setCurrentPendingCalculationId(null);
            console.warn(`main.js: Loaded currentPendingCalculationId (${appState.currentPendingCalculationId}) did not match a valid pending item in history. Resetting ID to null.`);
        }
    } else {
        state.setCurrentPendingCalculationId(null); // Ensure it's null if not in saved state
        console.log("main.js: currentPendingCalculationId not found in saved state. Setting to null.");
    }


    if (appState.TOGGLES) {
        state.setToggles(appState.TOGGLES);
        console.log("main.js: Loaded toggles, useAdvancedCalculations =", appState.TOGGLES.useAdvancedCalculations);
    }
    if (appState.strategyStates) state.setStrategyStates(appState.strategyStates);
    if (appState.patternMemory) state.setPatternMemory(appState.patternMemory);
    if (appState.adaptiveFactorInfluences) Object.assign(state.adaptiveFactorInfluences, appState.adaptiveFactorInfluences); // Ensure this is merged, not overwritten
    if (appState.STRATEGY_CONFIG) Object.assign(config.STRATEGY_CONFIG, appState.STRATEGY_CONFIG);
    if (appState.ADAPTIVE_LEARNING_RATES) Object.assign(config.ADAPTIVE_LEARNING_RATES, appState.ADAPTIVE_LEARNING_RATES);

    analysis.updateActivePredictionTypes();
    ui.updateAllTogglesUI();
    ui.initializeAdvancedSettingsUI();
    console.log("main.js: loadState finished.");
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
console.log("main.js: Running initial analyses.");
analysis.runAllAnalyses(); // This will update analysis panels and potentially pending history item details
ui.renderHistory(); // Ensure history list is rendered based on loaded state

// NEW: Call updateMainRecommendationDisplay explicitly on initial load to show current recommendation
// This uses the current input fields (which might be empty) and current settings.
console.log("main.js: Calling updateMainRecommendationDisplay on initial load.");
ui.updateMainRecommendationDisplay();

// 5. Initialize the AI worker correctly, giving it time to load its resources
console.log("main.js: Initializing AI worker.");
analysis.initializeAi();

// NEW: Attach optimization button listeners *after* workers are initialized
ui.attachOptimizationButtonListeners();

console.log("Application initialized using modular structure.");