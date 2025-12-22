// js/ui.helpers.js

// --- DOM ELEMENT REFERENCES (Shared across UI modules) ---
export const dom = {};

// --- TRAINING LOG STATE ---
export const MAX_TRAINING_LOG_ENTRIES = 200;
export let trainingLogEntries = [];

// --- PARAMETER DEFINITIONS for UI (matches optimizationWorker's parameterSpace) ---
export const parameterDefinitions = {
    // Core Strategy Parameters
    learningRate_success: { min: 0.01, max: 1.0, step: 0.01, category: 'coreStrategy' },
    learningRate_failure: { min: 0.01, max: 0.5, step: 0.01, category: 'coreStrategy' },
    maxWeight: { min: 1.0, max: 10.0, step: 0.1, category: 'coreStrategy' },
    minWeight: { min: 0.0, max: 1.0, step: 0.01, category: 'coreStrategy' },
    decayFactor: { min: 0.7, max: 0.99, step: 0.01, category: 'coreStrategy' },
    patternMinAttempts: { min: 1, max: 20, step: 1, category: 'coreStrategy' },
    patternSuccessThreshold: { min: 50, max: 100, step: 1, category: 'coreStrategy' },
    triggerMinAttempts: { min: 1, max: 20, step: 1, category: 'coreStrategy' },
    triggerSuccessThreshold: { min: 50, max: 100, step: 1, category: 'coreStrategy' },
    // Adaptive Influence Rates
    SUCCESS: { min: 0.01, max: 0.5, step: 0.01, category: 'adaptiveRates' },
    FAILURE: { min: 0.01, max: 0.5, step: 0.01, category: 'adaptiveRates' },
    MIN_INFLUENCE: { min: 0.0, max: 1.0, step: 0.01, category: 'adaptiveRates' },
    MAX_INFLUENCE: { min: 1.0, max: 5.0, step: 0.1, category: 'adaptiveRates' },
    // Table Change Warning Parameters
    WARNING_ROLLING_WINDOW_SIZE: { min: 5, max: 50, step: 1, category: 'warningParameters' },
    WARNING_MIN_PLAYS_FOR_EVAL: { min: 1, max: 20, step: 1, category: 'warningParameters' },
    WARNING_LOSS_STREAK_THRESHOLD: { min: 1, max: 10, step: 1, category: 'warningParameters' },
    WARNING_ROLLING_WIN_RATE_THRESHOLD: { min: 0, max: 100, step: 1, category: 'warningParameters' },
    DEFAULT_AVERAGE_WIN_RATE: { min: 0, max: 100, step: 1, category: 'warningParameters' }
};

// Map parameter names to their respective config objects and display labels
export const parameterMap = {
    // Strategy Core Settings
    learningRate_success: { label: 'Success Learn Rate', container: 'strategyLearningRatesSliders' },
    learningRate_failure: { label: 'Failure Learn Rate', container: 'strategyLearningRatesSliders' },
    maxWeight: { label: 'Max Weight', container: 'strategyLearningRatesSliders' },
    minWeight: { label: 'Min Weight', container: 'strategyLearningRatesSliders' },
    decayFactor: { label: 'Decay Factor', container: 'strategyLearningRatesSliders' },
    patternMinAttempts: { label: 'Pattern Min Attempts', container: 'patternThresholdsSliders' },
    patternSuccessThreshold: { label: 'Pattern Success %', container: 'patternThresholdsSliders' },
    triggerMinAttempts: { label: 'Trigger Min Attempts', container: 'patternThresholdsSliders' },
    triggerSuccessThreshold: { label: 'Trigger Success %', container: 'patternThresholdsSliders' },
    // Adaptive Influence Rates
    SUCCESS: { label: 'Adaptive Success Rate', container: 'adaptiveInfluenceSliders' },
    FAILURE: { label: 'Adaptive Failure Rate', container: 'adaptiveInfluenceSliders' },
    MIN_INFLUENCE: { label: 'Min Influence', container: 'adaptiveInfluenceSliders' },
    MAX_INFLUENCE: { label: 'Max Influence', container: 'adaptiveInfluenceSliders' },
    // Warning Parameters
    WARNING_ROLLING_WINDOW_SIZE: { label: 'Rolling Window', container: 'warningParametersSliders' },
    WARNING_MIN_PLAYS_FOR_EVAL: { label: 'Min Plays for Eval', container: 'warningParametersSliders' },
    WARNING_LOSS_STREAK_THRESHOLD: { label: 'Loss Streak Threshold', container: 'warningParametersSliders' },
    WARNING_ROLLING_WIN_RATE_THRESHOLD: { label: 'Win Rate Threshold %', container: 'warningParametersSliders' },
    DEFAULT_AVERAGE_WIN_RATE: { label: 'Default Avg Win Rate %', container: 'warningParametersSliders' }
};

// --- HELPER FUNCTIONS ---

/**
 * Returns the color class for a roulette number
 * @param {number} num - Roulette number (0-36)
 * @returns {string} CSS class name
 */
export function getRouletteNumberColor(num) {
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    if (num === 0) return 'green';
    return redNumbers.includes(num) ? 'red' : 'black';
}

/**
 * Toggle visibility of a guide/content section
 * @param {string} contentId - ID of the content element to toggle
 */
export function toggleGuide(contentId) {
    const content = document.getElementById(contentId);
    if (content) {
        content.classList.toggle('open');
    }
}

/**
 * Shows a pattern alert message with the given warning text.
 * @param {string} message - The warning message to display
 */
export function showPatternAlert(message) {
    if (dom.patternAlert) {
        dom.patternAlert.innerHTML = `<strong>Warning:</strong> ${message}`;
        dom.patternAlert.classList.remove('hidden');
    }
}

/**
 * Hides the pattern alert message.
 */
export function hidePatternAlert() {
    if (dom.patternAlert) {
        dom.patternAlert.classList.add('hidden');
        dom.patternAlert.textContent = '';
    }
}

export function updateApiLiveButtonState(isPollingActive) {
    if (!dom.apiLiveButton) return;
    
    if (isPollingActive) {
        dom.apiLiveButton.textContent = 'Stop Live';
        dom.apiLiveButton.classList.remove('btn-primary');
        dom.apiLiveButton.classList.add('btn-danger');
    } else {
        dom.apiLiveButton.textContent = 'Live';
        dom.apiLiveButton.classList.remove('btn-danger');
        dom.apiLiveButton.classList.add('btn-primary');
    }
}

/**
 * Updates the historical data indicator in the UI
 * @param {Object} status - Status object from apiContext.getDataSourceStatus()
 */
export function updateHistoricalDataIndicator(status) {
    if (!dom.historicalDataIndicator) return;
    
    let indicatorHtml = '';
    let indicatorClass = '';
    
    if (!status || status.status === 'not_initialized') {
        indicatorHtml = `
            <div class="flex items-center text-gray-400">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span class="text-xs">No data loaded</span>
            </div>
        `;
        indicatorClass = 'bg-gray-50 border-gray-200';
    } else if (status.isApiCalibrated) {
        indicatorHtml = `
            <div class="flex items-center text-green-700">
                <svg class="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                </svg>
                <div>
                    <span class="text-xs font-semibold">${status.label}</span>
                    <span class="text-xs text-green-600 block">${status.description}</span>
                </div>
            </div>
        `;
        indicatorClass = 'bg-green-50 border-green-200';
    } else {
        indicatorHtml = `
            <div class="flex items-center text-amber-700">
                <svg class="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
                <div>
                    <span class="text-xs font-semibold">${status.label}</span>
                    <span class="text-xs text-amber-600 block">${status.description}</span>
                </div>
            </div>
        `;
        indicatorClass = 'bg-amber-50 border-amber-200';
    }
    
    dom.historicalDataIndicator.innerHTML = indicatorHtml;
    dom.historicalDataIndicator.className = `historical-data-indicator p-3 rounded-lg border ${indicatorClass}`;
}

// --- TRAINING LOG FUNCTIONS ---

/**
 * Renders the training log entries to the DOM
 */
export function renderTrainingLog() {
    if (!dom.trainingLogList) return;
    
    if (trainingLogEntries.length === 0) {
        dom.trainingLogList.innerHTML = '<div class="text-gray-400 text-center py-4">No log entries yet</div>';
        return;
    }
    
    dom.trainingLogList.innerHTML = trainingLogEntries.map(entry => {
        return `<div class="training-log-entry ${entry.type}">
            <span class="text-gray-400">[${entry.timestamp}]</span> ${entry.message}
        </div>`;
    }).join('');
}

/**
 * Adds an entry to the training log
 * @param {string} type - 'info' | 'success' | 'warning' | 'error' | 'data'
 * @param {string} message - The log message
 * @param {boolean} autoExpand - Whether to auto-expand log on this entry (default: false for non-errors)
 */
export function addTrainingLogEntry(type, message, autoExpand = false) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { type, message, timestamp };
    
    trainingLogEntries.unshift(entry); // Add to beginning (newest first)
    
    // Cap log length
    if (trainingLogEntries.length > MAX_TRAINING_LOG_ENTRIES) {
        trainingLogEntries = trainingLogEntries.slice(0, MAX_TRAINING_LOG_ENTRIES);
    }
    
    renderTrainingLog();
    
    // Auto-expand on errors
    if (type === 'error' || autoExpand) {
        expandTrainingLog();
    }
}

/**
 * Clears all training log entries
 */
export function clearTrainingLog() {
    trainingLogEntries = [];
    renderTrainingLog();
}

/**
 * Expands the training log panel
 */
export function expandTrainingLog() {
    if (dom.trainingLogContent) {
        dom.trainingLogContent.classList.add('open');
    }
    if (dom.trainingLogToggle) {
        dom.trainingLogToggle.textContent = 'Hide Log ^';
    }
}

/**
 * Collapses the training log panel
 */
export function collapseTrainingLog() {
    if (dom.trainingLogContent) {
        dom.trainingLogContent.classList.remove('open');
    }
    if (dom.trainingLogToggle) {
        dom.trainingLogToggle.textContent = 'Show Log v';
    }
}

/**
 * Toggles the training log panel
 */
export function toggleTrainingLog() {
    if (dom.trainingLogContent && dom.trainingLogContent.classList.contains('open')) {
        collapseTrainingLog();
    } else {
        expandTrainingLog();
    }
}

/**
 * Populates the dom object with element references
 */
export function initializeDomReferences() {
    const elementIds = [
        'number1', 'number2', 'resultDisplay', 'historyList', 'analysisList', 'boardStateAnalysis',
        'boardStateConclusion', 'aiModelStatus',
        'trendConfirmationToggle', 'weightedZoneToggle', 'proximityBoostToggle', 'pocketDistanceToggle',
        'lowestPocketDistanceToggle', 'advancedCalculationsToggle', 'dynamicStrategyToggle',
        'adaptivePlayToggle', 'tableChangeWarningsToggle', 'dueForHitToggle', 'neighbourFocusToggle',
        'lessStrictModeToggle', 'dynamicTerminalNeighbourCountToggle',
        'rouletteWheelContainer', 'rouletteLegend', 'strategyWeightsDisplay', 'winningNumberInput',
        'historyInfoToggle', 'historyInfoDropdown', 'winCount', 'lossCount', 'optimizationStatus',
        'optimizationResult', 'bestFitnessResult', 'bestParamsResult', 'applyBestParamsButton',
        'startOptimizationButton', 'stopOptimizationButton', 'advancedSettingsHeader',
        'advancedSettingsContent', 'strategyLearningRatesSliders', 'patternThresholdsSliders',
        'adaptiveInfluenceSliders', 'resetParametersButton', 'saveParametersButton', 'loadParametersInput',
        'loadParametersLabel', 'parameterStatusMessage', 'submitResultButton', 'patternAlert',
        'warningParametersSliders',
        'optimizeCoreStrategyToggle', 'optimizeAdaptiveRatesToggle',
        // API integration elements
        'apiProviderSelect', 'apiTableSelect', 'apiAutoToggle', 'apiLiveButton', 
        'apiRefreshButton', 'apiLoadHistoryButton', 'apiStatusMessage',
        // NEW: Historical data indicator
        'historicalDataIndicator',
        // Training elements
        'trainAiButton', 'trainingLogToggle', 'trainingLogHeader', 'trainingLogContent', 
        'trainingLogList', 'clearTrainingLogButton',
        // Optimizer debug panel elements
        'optimizerDebugToggle', 'optimizerDebugHeader', 'optimizerDebugContent', 'optimizerDebugData'
    ];
    elementIds.forEach(id => { if(document.getElementById(id)) dom[id] = document.getElementById(id) });
}