// js/ui.js

// --- IMPORTS ---
// Import helpers (includes dom, training log functions, shared utilities)
import { 
    dom, 
    initializeDomReferences,
    addTrainingLogEntry, 
    clearTrainingLog, 
    expandTrainingLog, 
    collapseTrainingLog,
    showPatternAlert,
    hidePatternAlert
} from './ui.helpers.js';

// Import card rendering functions
import { 
    updateAllTogglesUI, 
    updateWinLossCounter, 
    drawRouletteWheel, 
    renderHistory, 
    renderAnalysisList, 
    renderBoardState, 
    renderStrategyWeights, 
    updateRouletteLegend, 
    updateOptimizationStatus, 
    showOptimizationComplete, 
    showOptimizationStopped, 
    updateOptimizerDebugPanel,
    updateAiStatus, 
    updateMainRecommendationDisplay, 
    initializeAdvancedSettingsUI, 
    toggleParameterSliders,
    getRecommendationDataForDisplay
} from './ui.cards.js';

// Import event handlers and listener attachment functions
import { 
    attachMainActionListeners,
    attachOptimizationButtonListeners,
    attachToggleListeners,
    attachAdvancedSettingsListeners,
    attachTrainingListeners,
    attachGuideAndInfoListeners,
    attachApiEventHandlers
} from './ui.events.js';

// --- RE-EXPORTS ---
// Re-export all public functions so external modules can import from ui.js as before

// From ui.helpers.js
export { 
    addTrainingLogEntry, 
    clearTrainingLog, 
    expandTrainingLog, 
    collapseTrainingLog 
};

// From ui.cards.js
export { 
    updateAllTogglesUI, 
    updateWinLossCounter, 
    drawRouletteWheel, 
    renderHistory, 
    renderAnalysisList, 
    renderBoardState, 
    renderStrategyWeights, 
    updateRouletteLegend, 
    updateOptimizationStatus, 
    showOptimizationComplete, 
    showOptimizationStopped, 
    updateAiStatus, 
    updateMainRecommendationDisplay, 
    initializeAdvancedSettingsUI, 
    toggleParameterSliders,
    updateOptimizerDebugPanel  // NEW
};

// From ui.events.js
export { attachOptimizationButtonListeners };

// --- INITIALIZATION ---
export function initializeUI() {
    // 1. Populate the dom object with element references
    initializeDomReferences();

    // 2. Attach all event listeners in the same order as before
    attachMainActionListeners();
    attachToggleListeners();
    attachAdvancedSettingsListeners();
    attachGuideAndInfoListeners();
    attachApiEventHandlers();
    attachTrainingListeners();
}

