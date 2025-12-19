// js/ui.events.js

// --- IMPORTS ---
import { getHitZone, calculateTrendStats, getBoardStateStats, calculatePocketDistance, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import { aiWorker, optimizationWorker } from './workers.js';
import * as analysis from './analysis.js';
import * as winspinApi from './api/winspin.js';
import { apiContext } from './api/apiContextManager.js';
import { dom, toggleGuide, hidePatternAlert, updateApiLiveButtonState, addTrainingLogEntry, clearTrainingLog, toggleTrainingLog } from './ui.helpers.js';
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

// --- EVENT HANDLERS ---

/**
 * Handles the "Calculate" button click.
 */
export function handleNewCalculation(isAutoCall = false) {
    console.log("handleNewCalculation: Function started.");
    
    if (apiContext.isAutoModeEnabled() && isAutoCall !== true) {
        alert('Auto mode is enabled. Disable it to use manual input.');
        return;
    }
    
    const num1Val = parseInt(dom.number1.value, 10);
    const num2Val = parseInt(dom.number2.value, 10);

    if (isNaN(num1Val) || isNaN(num2Val)) {
        console.log("handleNewCalculation: Invalid inputs detected. Updating display and returning.");
        updateMainRecommendationDisplay();
        return;
    }

    const existingPendingItem = state.history.find(
        item => item.status === 'pending' && item.winningNumber === null
    );

    if (existingPendingItem) {
        console.warn(`handleNewCalculation: An unresolved pending calculation (ID: ${existingPendingItem.id}) already exists. Not creating a new one.`);
        // Only alert if this is a manual attempt, otherwise just log and return to avoid spamming alerts in auto mode
        if (isAutoCall !== true) {
            alert("There's already a pending calculation. Please submit the winning number for that one first, or clear history.");
        }
        updateMainRecommendationDisplay();
        return;
    }


    const newHistoryItem = {
        id: Date.now(),
        num1: num1Val,
        num2: num2Val,
        difference: Math.abs(num2Val - num1Val),
        status: 'pending',
        hitTypes: [],
        typeSuccessStatus: {},
        winningNumber: null,
        pocketDistance: null,
        recommendedGroupId: null,
        recommendationDetails: null
    };
    state.history.push(newHistoryItem);
    console.log(`handleNewCalculation: New history item created with ID: ${newHistoryItem.id}. Total history items: ${state.history.length}`);

    state.setCurrentPendingCalculationId(newHistoryItem.id);

    getRecommendationDataForDisplay(num1Val, num2Val).then(recommendation => {
        console.log(`handleNewCalculation: Got recommendation for ID ${newHistoryItem.id}.`);
        const itemToUpdate = state.history.find(item =>
            item.id === newHistoryItem.id && item.status === 'pending' && item.winningNumber === null
        );
        if (itemToUpdate) {
            itemToUpdate.recommendedGroupId = recommendation.bestCandidate?.type.id || null;
            itemToUpdate.recommendationDetails = {
                ...recommendation.details,
                signal: recommendation.signal,
                reason: recommendation.reason
            };
            console.log(`handleNewCalculation: Updated history item ID ${itemToUpdate.id} with recommendation details.`);
        } else {
            console.error(`handleNewCalculation: Failed to find newly created item (ID: ${newHistoryItem.id}) for detail update.`);
        }
        renderHistory();
        updateMainRecommendationDisplay();
        console.log("handleNewCalculation: UI updated and function finished.");
    });
}


export function handleSubmitResult() {
    console.log("handleSubmitResult: Function started.");
    
    if (apiContext.isAutoModeEnabled()) {
        alert('Auto mode is enabled. Disable it to use manual input.');
        return;
    }
    
    console.log(`handleSubmitResult: state.currentPendingCalculationId at start: ${state.currentPendingCalculationId}`);

    if (!state.currentPendingCalculationId) {
        console.log("handleSubmitResult: No current pending calculation ID set.");
        hidePatternAlert();
        updateMainRecommendationDisplay();
        return;
    }

    const winningNumberVal = dom.winningNumberInput.value;
    let winningNumber = null;
    if (winningNumberVal.trim() !== '') {
        winningNumber = parseInt(winningNumberVal, 10);
    }

    if (winningNumber === null || isNaN(winningNumber) || winningNumber < 0 || winningNumber > 36) {
        alert("Please enter a valid winning number (0-36).");
        console.log("handleSubmitResult: Invalid winning number input. Alert shown.");
        return;
    }

    const lastPendingForSubmission = state.history.find(
        item => item.id === state.currentPendingCalculationId && item.status === 'pending' && item.winningNumber === null
    );

    if (!lastPendingForSubmission) {
        console.error("handleSubmitResult: Could not find pending calculation by stored ID.");
        state.setCurrentPendingCalculationId(null);
        updateMainRecommendationDisplay();
        return;
    }
    console.log(`handleSubmitResult: Found pending item by stored ID: ${lastPendingForSubmission.id}. Resolving this item.`);

    evaluateCalculationStatus(lastPendingForSubmission, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
    console.log(`handleSubmitResult: Item ID ${lastPendingForSubmission.id} resolved to status: ${lastPendingForSubmission.status}`);

    state.setCurrentPendingCalculationId(null);

    const newLog = state.history
        .filter(item => item.winningNumber !== null)
        .sort((a, b) => a.id - b.id)
        .map(item => item.winningNumber);
    state.setConfirmedWinsLog(newLog);
    console.log("handleSubmitResult: confirmedWinsLog updated.");

    analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));

    analysis.runAllAnalyses(winningNumber);
    renderHistory();
    console.log("handleSubmitResult: Analysis and history re-rendered.");

    dom.winningNumberInput.value = '';
    console.log("handleSubmitResult: Winning number input cleared.");

    const prevNum2 = parseInt(lastPendingForSubmission.num2, 10);
    if (!isNaN(prevNum2)) {
        dom.number1.value = prevNum2;
        dom.number2.value = winningNumber;
        console.log(`handleSubmitResult: Auto-populating for next spin: num1=${dom.number1.value}, num2=${dom.number2.value}`);
        setTimeout(() => {
            console.log("handleSubmitResult: Triggering next handleNewCalculation via setTimeout.");
            handleNewCalculation();
        }, 50);
    } else {
        console.warn('handleSubmitResult: previous num2 was not a valid number for auto-calculation.');
        updateMainRecommendationDisplay();
    }
    hidePatternAlert();
    console.log("handleSubmitResult: Function finished.");
}


export function handleClearInputs() {
    console.log("handleClearInputs: Function started.");
    dom.number1.value = '';
    dom.number2.value = '';
    dom.winningNumberInput.value = '';
    dom.resultDisplay.classList.add('hidden');
    dom.number1.focus();
    state.setCurrentPendingCalculationId(null);

    if (apiContext.isLivePollingActive()) {
        apiContext.stopLivePolling();
        updateApiLiveButtonState(false);
    }

    drawRouletteWheel(null, state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null);
    updateMainRecommendationDisplay();
    hidePatternAlert();
    console.log("handleClearInputs: Inputs cleared and UI updated.");
}

export function handleSwap() {
    console.log("handleSwap: Function started.");
    const v = dom.number1.value;
    dom.number1.value = dom.number2.value;
    dom.number2.value = v;
    updateMainRecommendationDisplay();
    console.log("handleSwap: Inputs swapped and UI updated.");
}

export function handleHistoryAction(event) {
    console.log("handleHistoryAction: Function started.");
    const button = event.target.closest('.delete-btn');
    if (!button) return;

    const deletedId = parseInt(button.dataset.id);
    const newHistory = state.history.filter(item => item.id !== deletedId);
    state.setHistory(newHistory);

    if (state.currentPendingCalculationId === deletedId) {
        state.setCurrentPendingCalculationId(null);
        console.log(`handleHistoryAction: Cleared currentPendingCalculationId as deleted item (ID: ${deletedId}) was pending.`);
    }

    const newLog = state.history.filter(item => item.winningNumber !== null).map(item => item.winningNumber);
    state.setConfirmedWinsLog(newLog);

    analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));

    analysis.runAllAnalyses();
    renderHistory();
    updateMainRecommendationDisplay();
    hidePatternAlert();
    console.log("handleHistoryAction: History modified and UI updated.");
}

export function handleClearHistory() {
    console.log("handleClearHistory: Function started.");
    state.setHistory([]);
    state.setConfirmedWinsLog([]);
    state.setPatternMemory({});
    state.setAdaptiveFactorInfluences({
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    });
    state.setIsAiReady(false);
    updateAiStatus(`AI Model: Need at least ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);
    state.setCurrentPendingCalculationId(null);

    apiContext.clearContext();

    analysis.runAllAnalyses();
    renderHistory();

    drawRouletteWheel();

    aiWorker.postMessage({ type: 'clear_model' });
    hidePatternAlert();
    updateMainRecommendationDisplay();
    
    // Log the clear action
    addTrainingLogEntry('info', 'History cleared. AI model reset.');
    
    console.log("handleClearHistory: History cleared and UI updated.");
}

export function handlePresetSelection(presetName) {
    console.log(`handlePresetSelection: Applying preset ${presetName}.`);
    const preset = config.STRATEGY_PRESETS[presetName];
    if (!preset) {
        console.error(`Preset "${presetName}" not found.`);
        return;
    }

    Object.assign(config.STRATEGY_CONFIG, preset.STRATEGY_CONFIG);
    Object.assign(config.ADAPTIVE_LEARNING_RATES, preset.ADAPTIVE_LEARNING_RATES);
    state.setToggles(preset.TOGGLES);

    updateAllTogglesUI();
    initializeAdvancedSettingsUI();
    analysis.updateActivePredictionTypes();
    analysis.handleStrategyChange();
    hidePatternAlert();
    updateMainRecommendationDisplay();
    console.log(`handlePresetSelection: Preset ${presetName} applied and UI updated.`);
}

export function resetAllParameters() {
    console.log("resetAllParameters: Function started.");
    Object.assign(config.STRATEGY_CONFIG, config.DEFAULT_PARAMETERS.STRATEGY_CONFIG);
    Object.assign(config.ADAPTIVE_LEARNING_RATES, config.DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES);
    state.setToggles(config.DEFAULT_PARAMETERS.TOGGLES);
    updateAllTogglesUI();
    initializeAdvancedSettingsUI();
    dom.parameterStatusMessage.textContent = 'Parameters reset to defaults.';
    analysis.handleStrategyChange();
    hidePatternAlert();
    updateMainRecommendationDisplay();
    console.log("resetAllParameters: Parameters reset and UI updated.");
}

export function saveParametersToFile() {
    console.log("saveParametersToFile: Function started.");
    const parametersToSave = {
        STRATEGY_CONFIG: config.STRATEGY_CONFIG,
        ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES,
        TOGGLES: {
            useTrendConfirmation: state.useTrendConfirmation, useWeightedZone: state.useWeightedZone,
            useProximityBoost: state.useProximityBoost, usePocketDistance: state.usePocketDistance,
            useLowestPocketDistance: state.useLowestPocketDistance, useAdvancedCalculations: state.useAdvancedCalculations,
            useDynamicStrategy: state.useDynamicStrategy, useAdaptivePlay: state.useAdaptivePlay,
            useTableChangeWarnings: state.useTableChangeWarnings, useDueForHit: state.useDueForHit,
            useNeighbourFocus: state.useNeighbourFocus, useLessStrict: state.useLessStrict,
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount
        }
    };
    const dataStr = JSON.stringify(parametersToSave, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'roulette_parameters.json';
    a.click();
    URL.revokeObjectURL(a.href);
    dom.parameterStatusMessage.textContent = 'Parameters saved.';
    console.log("saveParametersToFile: Parameters saved.");
}

export function loadParametersFromFile(event) {
    console.log("loadParametersFromFile: Function started.");
    const file = event.target.files[0];
    if (!file) {
        console.log("loadParametersFromFile: No file selected.");
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loaded = JSON.parse(e.target.result);
            if (loaded.STRATEGY_CONFIG) Object.assign(config.STRATEGY_CONFIG, loaded.STRATEGY_CONFIG);
            if (loaded.ADAPTIVE_LEARNING_RATES) Object.assign(config.ADAPTIVE_LEARNING_RATES, loaded.ADAPTIVE_LEARNING_RATES);
            if (loaded.TOGGLES) state.setToggles(loaded.TOGGLES);
            updateAllTogglesUI();
            initializeAdvancedSettingsUI();
            dom.parameterStatusMessage.textContent = 'Parameters loaded successfully!';
            analysis.handleStrategyChange();
        } catch (error) {
            dom.parameterStatusMessage.textContent = `Error: ${error.message}`;
            console.error("loadParametersFromFile: Error loading parameters:", error);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
    hidePatternAlert();
    updateMainRecommendationDisplay();
    console.log("loadParametersFromFile: File processed and UI updated.");
}

// --- API EVENT HANDLERS ---

function autoFillTerminalCalculatorFromHistory(history) {
    if (!history || history.length < 2) return;

    // history[0] is the latest spin, history[1] is the previous spin
    dom.number1.value = history[1];
    dom.number2.value = history[0];

    console.log(`Auto-filling terminal: num1=${dom.number1.value}, num2=${dom.number2.value}`);
    handleNewCalculation(true);
}

async function handleApiRefresh() {
    const provider = dom.apiProviderSelect.value;
    const tableName = dom.apiTableSelect.value;
    
    if (!provider || !tableName) {
        dom.apiStatusMessage.textContent = 'Error: No provider or table selected.';
        return;
    }
    
    try {
        const apiResponse = await winspinApi.fetchRouletteData(provider);
        apiContext.setLastApiResponse(apiResponse);
        
        const latestSpin = winspinApi.getLatestSpin(apiResponse, tableName);
        
        if (latestSpin === null) {
            dom.apiStatusMessage.textContent = 'No spins available for this table.';
            return;
        }
        
        const wasAdded = apiContext.addSpin(latestSpin.winningNumber);
        
        if (wasAdded) {
            await processApiSpin(latestSpin.winningNumber);
            
            // Auto-fill terminal with new data and trigger calculation
            const contextSpins = apiContext.getContextSpins();
            autoFillTerminalCalculatorFromHistory(contextSpins);
            
            dom.apiStatusMessage.textContent = `New spin: ${latestSpin.winningNumber}`;
        } else {
            dom.apiStatusMessage.textContent = `Latest spin: ${latestSpin.winningNumber} (no change)`;
        }
    } catch (error) {
        dom.apiStatusMessage.textContent = `Error: ${error.message}`;
        console.error('Error refreshing API data:', error);
    }
}

async function handleApiLoadHistory() {
    const provider = dom.apiProviderSelect.value;
    const tableName = dom.apiTableSelect.value;
    
    if (!provider || !tableName) {
        dom.apiStatusMessage.textContent = 'Error: No provider or table selected.';
        return;
    }
    
    const confirmed = confirm(
        'This will replace your current history with the last 30 spins from the API. Continue?'
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        dom.apiStatusMessage.textContent = 'Loading history...';
        
        const apiResponse = await winspinApi.fetchRouletteData(provider);
        apiContext.setLastApiResponse(apiResponse);
        
        const spins = winspinApi.getTableHistory(apiResponse, tableName);
        
        if (spins.length === 0) {
            dom.apiStatusMessage.textContent = 'No spins available for this table.';
            return;
        }
        
        apiContext.replaceContextSpins(spins);
        
        await processApiHistoryLoad(spins);
        
        // Auto-fill terminal with the loaded history
        autoFillTerminalCalculatorFromHistory(apiContext.getContextSpins());
        
        dom.apiStatusMessage.textContent = `Loaded ${spins.length} spins from API.`;
        
        // Log API history load
        addTrainingLogEntry('info', `API History loaded: ${spins.length} spins from ${tableName}`);
        addTrainingLogEntry('data', `First 5 (oldest): [${spins.slice(-5).reverse().join(', ')}]`);
        addTrainingLogEntry('data', `Last 5 (newest): [${spins.slice(0, 5).join(', ')}]`);
        
    } catch (error) {
        dom.apiStatusMessage.textContent = `Error: ${error.message}`;
        console.error('Error loading history:', error);
        addTrainingLogEntry('error', `API history load failed: ${error.message}`);
    }
}

async function processApiSpin(spin) {
    const contextSpins = apiContext.getContextSpins();
    
    if (contextSpins.length < 3) {
        console.log('Need at least 3 spins to process. Current count:', contextSpins.length);
        return;
    }
    
    const num1 = contextSpins[2];
    const num2 = contextSpins[1];
    const winningNumber = spin;
    
    const newHistoryItem = {
        id: Date.now(),
        num1,
        num2,
        difference: Math.abs(num2 - num1),
        status: 'pending',
        hitTypes: [],
        typeSuccessStatus: {},
        winningNumber: null,
        pocketDistance: null,
        recommendedGroupId: null,
        recommendationDetails: null
    };
    
    state.history.push(newHistoryItem);
    state.setCurrentPendingCalculationId(newHistoryItem.id);
    
    const recommendation = await getRecommendationDataForDisplay(num1, num2);
    
    const itemToUpdate = state.history.find(item =>
        item.id === newHistoryItem.id && item.status === 'pending' && item.winningNumber === null
    );
    
    if (itemToUpdate) {
        itemToUpdate.recommendedGroupId = recommendation.bestCandidate?.type.id || null;
        itemToUpdate.recommendationDetails = {
            ...recommendation.details,
            signal: recommendation.signal,
            reason: recommendation.reason
        };
    }
    
    evaluateCalculationStatus(itemToUpdate, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
    
    state.setCurrentPendingCalculationId(null);
    
    const newLog = state.history
        .filter(item => item.winningNumber !== null)
        .sort((a, b) => a.id - b.id)
        .map(item => item.winningNumber);
    state.setConfirmedWinsLog(newLog);
    
    analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));
    
    await analysis.runAllAnalyses(winningNumber);
    renderHistory();
    
    await updateMainRecommendationDisplay();
}

async function processApiHistoryLoad(spins) {
    let currentLivePendingItem = null;
    if (state.currentPendingCalculationId) {
        currentLivePendingItem = state.history.find(item => item.id === state.currentPendingCalculationId);
        if (currentLivePendingItem && currentLivePendingItem.status === 'pending' && currentLivePendingItem.winningNumber === null) {
            console.log(`API history load: Preserving current pending item ID: ${currentLivePendingItem.id}`);
        } else {
            currentLivePendingItem = null;
            state.setCurrentPendingCalculationId(null);
        }
    }
    
    // API returns newest->oldest, reverse to get oldest->newest for simulation
    const spinsOldestFirst = [...spins].reverse();
    
    const simulatedHistory = runSimulationOnHistory(spinsOldestFirst);
    
    if (currentLivePendingItem) {
        const newPendingCopy = { ...currentLivePendingItem };
        simulatedHistory.push(newPendingCopy);
        state.setCurrentPendingCalculationId(newPendingCopy.id);
        console.log(`API history load: Re-added preserved pending item ID: ${newPendingCopy.id}`);
    } else {
        state.setCurrentPendingCalculationId(null);
    }
    
    state.setHistory(simulatedHistory);
    state.setConfirmedWinsLog(simulatedHistory.filter(item => item.winningNumber !== null).map(item => item.winningNumber));
    analysis.labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));
    
    await analysis.runAllAnalyses();
    renderHistory();
    await updateMainRecommendationDisplay();
}

function runSimulationOnHistory(spinsToProcess) {
    const localHistory = [];
    let localConfirmedWinsLog = [];
    let localAdaptiveFactorInfluences = {
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    };
    
    if (spinsToProcess.length < 3) return [];
    
    for (let i = 2; i < spinsToProcess.length; i++) {
        const num1 = spinsToProcess[i - 2];
        const num2 = spinsToProcess[i - 1];
        const winningNumber = spinsToProcess[i];
        
        for (const factorName in localAdaptiveFactorInfluences) {
            localAdaptiveFactorInfluences[factorName] = Math.max(
                config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE,
                localAdaptiveFactorInfluences[factorName] * config.ADAPTIVE_LEARNING_RATES.FORGET_FACTOR
            );
        }
        
        const trendStats = calculateTrendStats(localHistory, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        const boardStats = getBoardStateStats(localHistory, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        const neighbourScores = runSharedNeighbourAnalysis(localHistory, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        
        const recommendation = getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: num1, inputNum2: num2,
            isForWeightUpdate: false, aiPredictionData: null, currentAdaptiveInfluences: localAdaptiveFactorInfluences,
            lastWinningNumber: localConfirmedWinsLog.length > 0 ? localConfirmedWinsLog[localConfirmedWinsLog.length - 1] : null,
            useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
            useNeighbourFocusBool: state.useNeighbourFocus, isAiReadyBool: false,
            useTrendConfirmationBool: state.useTrendConfirmation, useAdaptivePlayBool: state.useAdaptivePlay, useLessStrictBool: state.useLessStrict,
            current_STRATEGY_CONFIG: config.STRATEGY_CONFIG,
            current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: localHistory,
            activePredictionTypes: state.activePredictionTypes,
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount, allPredictionTypes: config.allPredictionTypes,
            terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });
        
        const newHistoryItem = {
            id: Date.now() + i,
            num1,
            num2,
            difference: Math.abs(num2 - num1),
            status: 'resolved',
            hitTypes: [],
            typeSuccessStatus: {},
            winningNumber,
            recommendedGroupId: recommendation.bestCandidate?.type.id || null,
            recommendationDetails: recommendation.bestCandidate?.details || null
        };
        
        evaluateCalculationStatus(newHistoryItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
        localHistory.push(newHistoryItem);
        
        if (newHistoryItem.recommendedGroupId && newHistoryItem.recommendationDetails?.primaryDrivingFactor) {
            const primaryFactor = newHistoryItem.recommendationDetails.primaryDrivingFactor;
            const influenceChangeMagnitude = Math.max(0, newHistoryItem.recommendationDetails.finalScore - config.ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MIN_THRESHOLD) * config.ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MULTIPLIER;
            
            if (localAdaptiveFactorInfluences[primaryFactor] === undefined) localAdaptiveFactorInfluences[primaryFactor] = 1.0;
            
            if (newHistoryItem.hitTypes.includes(newHistoryItem.recommendedGroupId)) {
                localAdaptiveFactorInfluences[primaryFactor] = Math.min(
                    config.ADAPTIVE_LEARNING_RATES.MAX_INFLUENCE,
                    localAdaptiveFactorInfluences[primaryFactor] + (config.ADAPTIVE_LEARNING_RATES.SUCCESS + influenceChangeMagnitude)
                );
            } else {
                localAdaptiveFactorInfluences[primaryFactor] = Math.max(
                    config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE,
                    localAdaptiveFactorInfluences[primaryFactor] - (config.ADAPTIVE_LEARNING_RATES.FAILURE + influenceChangeMagnitude)
                );
            }
        }
        
        if (winningNumber !== null) {
            localConfirmedWinsLog.push(winningNumber);
        }
    }
    
    return localHistory;
}

function startLivePolling() {
    apiContext.stopLivePolling();
    
    handleApiRefresh();
    
    const intervalId = setInterval(async () => {
        await handleApiRefresh();
    }, 2500);
    
    apiContext.setLivePollingInterval(intervalId);
}

// --- LISTENER ATTACHMENT FUNCTIONS ---

export function attachMainActionListeners() {
    document.getElementById('calculateButton').addEventListener('click', handleNewCalculation);
    document.getElementById('submitResultButton').addEventListener('click', handleSubmitResult);

    document.getElementById('clearInputsButton').addEventListener('click', handleClearInputs);
    document.getElementById('swapButton').addEventListener('click', handleSwap);
    document.getElementById('clearHistoryButton').addEventListener('click', handleClearHistory);
    dom.historyList.addEventListener('click', handleHistoryAction);

    [dom.number1, dom.number2].forEach(input => input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            console.log("Enter key pressed in number input. Triggering handleNewCalculation.");
            handleNewCalculation();
        }
    }));

    dom.winningNumberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            console.log("Enter key pressed in winning number input. Triggering handleSubmitResult.");
            handleSubmitResult();
        }
    });
}

export function attachOptimizationButtonListeners() {
    // NEW: Worker handler for optimization progress/completion
    optimizationWorker.onmessage = function (e) {
        const { type, payload } = e.data;
        if (type === 'progress') {
            const progressHtml = payload.message || 'Optimizing...';
            updateOptimizationStatus(progressHtml);
            state.setBestFoundParams(payload);
            // NEW: Update debug panel
            if (payload.debugMetrics) {
                updateOptimizerDebugPanel(payload.debugMetrics);
            }
        } else if (type === 'complete') {
            showOptimizationComplete(payload);
            state.setBestFoundParams(payload);
            // NEW: Update debug panel with final data
            if (payload.debugMetrics) {
                updateOptimizerDebugPanel(payload.debugMetrics);
            }
        }
    };

    if (dom.startOptimizationButton) {
        dom.startOptimizationButton.addEventListener('click', () => {
            console.log("Start Optimization button clicked.");
            if (state.history.length < 20) {
                updateOptimizationStatus('Error: Need at least 20 history items.');
                return;
            }
            updateOptimizationStatus('Starting optimization...');
            dom.optimizationResult.classList.add('hidden');
            toggleParameterSliders(false);
            dom.startOptimizationButton.disabled = true;
            dom.stopOptimizationButton.disabled = false;

            const togglesForWorker = {
                useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
                useProximityBoost: state.useProximityBoost,
                useWeightedZone: state.useWeightedZone,
                useNeighbourFocus: state.useNeighbourFocus,
                useTrendConfirmation: state.useTrendConfirmation,
                usePocketDistance: state.usePocketDistance,
                useLowestPocketDistance: state.useLowestPocketDistance,
                useAdvancedCalculations: state.useAdvancedCalculations,
                useDynamicStrategy: state.useDynamicStrategy,
                useAdaptivePlay: state.useAdaptivePlay,
                useTableChangeWarnings: state.useTableChangeWarnings,
                useDueForHit: state.useDueForHit,
                useLessStrict: state.useLessStrict
            };

            optimizationWorker.postMessage({
                type: 'start',
                payload: {
                    history: state.history,
                    terminalMapping: config.terminalMapping,
                    rouletteWheel: config.rouletteWheel,
                    GA_CONFIG: config.GA_CONFIG,
                    toggles: togglesForWorker,
                    optimizeCategories: {
                        coreStrategy: dom.optimizeCoreStrategyToggle.checked,
                        adaptiveRates: dom.optimizeAdaptiveRatesToggle.checked
                    }
                }
            });
        });
    }

    if (dom.stopOptimizationButton) {
        dom.stopOptimizationButton.addEventListener('click', () => {
            console.log("Stop Optimization button clicked.");
            optimizationWorker.postMessage({ type: 'stop' });
        });
    }

    if (dom.applyBestParamsButton) {
        dom.applyBestParamsButton.addEventListener('click', () => {
            console.log("Apply Best Params button clicked.");
            if (state.bestFoundParams) {
                const params = state.bestFoundParams.bestIndividual;
                const toggles = state.bestFoundParams.togglesUsed;

                Object.assign(config.STRATEGY_CONFIG, {
                    learningRate_success: params.learningRate_success, decayFactor: params.decayFactor,
                    learningRate_failure: params.learningRate_failure, maxWeight: params.maxWeight,
                    minWeight: params.minWeight, patternMinAttempts: params.patternMinAttempts,
                    patternSuccessThreshold: params.patternSuccessThreshold, triggerMinAttempts: params.triggerMinAttempts,
                    triggerSuccessThreshold: params.triggerSuccessThreshold,
                    hitRateThreshold: params.hitRateThreshold,
                    hitRateMultiplier: params.hitRateMultiplier,
                    maxStreakPoints: params.maxStreakPoints,
                    streakMultiplier: params.streakMultiplier,
                    proximityMaxDistance: params.proximityMaxDistance,
                    proximityMultiplier: params.proximityMultiplier,
                    maxNeighbourPoints: params.maxNeighbourPoints,
                    neighbourMultiplier: params.neighbourMultiplier,
                    aiConfidenceMultiplier: params.aiConfidenceMultiplier,
                    minAiPointsForReason: params.minAiPointsForReason,
                    ADAPTIVE_STRONG_PLAY_THRESHOLD: params.ADAPTIVE_STRONG_PLAY_THRESHOLD,
                    ADAPTIVE_PLAY_THRESHOLD: params.ADAPTIVE_PLAY_THRESHOLD,
                    LESS_STRICT_STRONG_PLAY_THRESHOLD: params.LESS_STRICT_STRONG_PLAY_THRESHOLD,
                    LESS_STRICT_PLAY_THRESHOLD: params.LESS_STRICT_PLAY_THRESHOLD,
                    LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: params.LESS_STRICT_HIGH_HIT_RATE_THRESHOLD,
                    LESS_STRICT_MIN_STREAK: params.LESS_STRICT_MIN_STREAK,
                    SIMPLE_PLAY_THRESHOLD: params.SIMPLE_PLAY_THRESHOLD,
                    MIN_TREND_HISTORY_FOR_CONFIRMATION: params.MIN_TREND_HISTORY_FOR_CONFIRMATION,
                    WARNING_ROLLING_WINDOW_SIZE: params.WARNING_ROLLING_WINDOW_SIZE,
                    WARNING_MIN_PLAYS_FOR_EVAL: params.WARNING_MIN_PLAYS_FOR_EVAL,
                    WARNING_LOSS_STREAK_THRESHOLD: params.WARNING_LOSS_STREAK_THRESHOLD,
                    WARNING_ROLLING_WIN_RATE_THRESHOLD: params.WARNING_ROLLING_WIN_RATE_THRESHOLD,
                    DEFAULT_AVERAGE_WIN_RATE: params.DEFAULT_AVERAGE_WIN_RATE,
                    LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: params.LOW_POCKET_DISTANCE_BOOST_MULTIPLIER,
                    HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: params.HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER,
                    WARNING_FACTOR_SHIFT_WINDOW_SIZE: params.WARNING_FACTOR_SHIFT_WINDOW_SIZE,
                    WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: params.WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD,
                    WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: params.WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT
                });
                Object.assign(config.ADAPTIVE_LEARNING_RATES, {
                    SUCCESS: params.adaptiveSuccessRate, FAILURE: params.adaptiveFailureRate,
                    MIN_INFLUENCE: params.minAdaptiveInfluence, MAX_INFLUENCE: params.maxAdaptiveInfluence,
                    FORGET_FACTOR: params.FORGET_FACTOR,
                    CONFIDENCE_WEIGHTING_MULTIPLIER: params.CONFIDENCE_WEIGHTING_MULTIPLIER,
                    CONFIDENCE_WEIGHTING_MIN_THRESHOLD: params.CONFIDENCE_WEIGHTING_MIN_THRESHOLD
                });

                if (toggles) {
                    state.setToggles(toggles);
                    updateAllTogglesUI();
                }

                initializeAdvancedSettingsUI();
                updateOptimizationStatus('Best parameters applied!');
                analysis.handleStrategyChange();
                hidePatternAlert();
                updateMainRecommendationDisplay();
            }
            console.log("Apply Best Params: Settings applied and UI updated.");
        });
    }

    // NEW: Debug panel toggle
    if (dom.optimizerDebugToggle || dom.optimizerDebugHeader) {
        const toggleElement = dom.optimizerDebugToggle || dom.optimizerDebugHeader;
        toggleElement.addEventListener('click', () => {
            if (dom.optimizerDebugContent) {
                dom.optimizerDebugContent.classList.toggle('open');
                if (dom.optimizerDebugToggle) {
                    const isOpen = dom.optimizerDebugContent.classList.contains('open');
                    dom.optimizerDebugToggle.textContent = isOpen ? 'Hide Debug ^' : 'Show Debug ▼';
                }
            }
        });
    }
}

export function attachToggleListeners() {
    const toggles = {
        trendConfirmationToggle: 'useTrendConfirmation', weightedZoneToggle: 'useWeightedZone',
        proximityBoostToggle: 'useProximityBoost', pocketDistanceToggle: 'usePocketDistance',
        lowestPocketDistanceToggle: 'useLowestPocketDistance', advancedCalculationsToggle: 'useAdvancedCalculations',
        dynamicStrategyToggle: 'useDynamicStrategy', adaptivePlayToggle: 'useAdaptivePlay',
        tableChangeWarningsToggle: 'useTableChangeWarnings', dueForHitToggle: 'useDueForHit',
        neighbourFocusToggle: 'useNeighbourFocus', lessStrictModeToggle: 'useLessStrict',
        dynamicTerminalNeighbourCountToggle: 'useDynamicTerminalNeighbourCount'
    };

    for (const [toggleId, stateKey] of Object.entries(toggles)) {
        dom[toggleId].addEventListener('change', () => {
            console.log(`Toggle '${toggleId}' changed.`);
            const newToggleStates = { ...state };
            newToggleStates[stateKey] = dom[toggleId].checked;
            state.setToggles(newToggleStates);

            if (stateKey === 'usePocketDistance') {
                renderHistory();
            } else {
                analysis.handleStrategyChange();
                const num1Val = parseInt(dom.number1.value, 10);
                const num2Val = parseInt(document.getElementById('number2').value, 10);
                const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length-1] : null;
                drawRouletteWheel(!isNaN(num1Val) && !isNaN(num2Val) ? Math.abs(num2Val-num1Val) : null, lastWinning);
            }
            hidePatternAlert();
            updateMainRecommendationDisplay();
            console.log(`Toggle '${toggleId}' change processed and UI updated.`);
        });
    }
}

export function attachAdvancedSettingsListeners() {
    dom.resetParametersButton.addEventListener('click', resetAllParameters);
    dom.saveParametersButton.addEventListener('click', saveParametersToFile);
    dom.loadParametersInput.addEventListener('change', loadParametersFromFile);

    dom.optimizeCoreStrategyToggle.addEventListener('change', () => toggleParameterSliders(true));
    dom.optimizeAdaptiveRatesToggle.addEventListener('change', () => toggleParameterSliders(true));
}

export function attachTrainingListeners() {
    // Train AI button handler
    if (dom.trainAiButton) {
        dom.trainAiButton.addEventListener('click', () => {
            analysis.handleTrainFromHistory();
        });
    }
    
    // Training log toggle
    if (dom.trainingLogToggle || dom.trainingLogHeader) {
        const toggleElement = dom.trainingLogToggle || dom.trainingLogHeader;
        toggleElement.addEventListener('click', toggleTrainingLog);
    }
    
    // Clear training log button
    if (dom.clearTrainingLogButton) {
        dom.clearTrainingLogButton.addEventListener('click', () => {
            clearTrainingLog();
            addTrainingLogEntry('info', 'Log cleared');
        });
    }
}

export function attachGuideAndInfoListeners() {
    document.getElementById('baseStrategyGuideHeader').addEventListener('click', () => toggleGuide('baseStrategyGuideContent'));
    document.getElementById('advancedStrategyGuideHeader').addEventListener('click', () => toggleGuide('advancedStrategyGuideContent'));
    document.getElementById('advancedSettingsHeader').addEventListener('click', () => toggleGuide('advancedSettingsContent'));

    if(dom.historyInfoToggle) {
        dom.historyInfoToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.historyInfoDropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!dom.historyInfoToggle.contains(e.target) && !dom.historyInfoDropdown.contains(e.target)) {
                dom.historyInfoDropdown.classList.add('hidden');
            }
        });
    }
}

export function attachApiEventHandlers() {
    if (dom.apiProviderSelect) {
        dom.apiProviderSelect.addEventListener('change', async () => {
            const provider = dom.apiProviderSelect.value;
            
            dom.apiTableSelect.innerHTML = '<option value="">Select Table</option>';
            dom.apiTableSelect.disabled = true;
            dom.apiAutoToggle.disabled = true;
            dom.apiLiveButton.disabled = true;
            dom.apiRefreshButton.disabled = true;
            dom.apiLoadHistoryButton.disabled = true;
            apiContext.stopLivePolling();
            updateApiLiveButtonState(false);
            
            if (!provider) {
                dom.apiStatusMessage.textContent = '';
                return;
            }
            
            dom.apiStatusMessage.textContent = 'Loading tables...';
            try {
                const apiResponse = await winspinApi.fetchRouletteData(provider);
                apiContext.setLastApiResponse(apiResponse);
                
                const tables = winspinApi.extractTableNames(apiResponse);
                
                if (tables.length === 0) {
                    dom.apiStatusMessage.textContent = 'No tables found for this provider.';
                    return;
                }
                
                tables.forEach(table => {
                    const option = document.createElement('option');
                    option.value = table.name;
                    option.textContent = table.name.replace(/_/g, ' ');
                    dom.apiTableSelect.appendChild(option);
                });
                
                dom.apiTableSelect.disabled = false;
                dom.apiStatusMessage.textContent = `${tables.length} table(s) available.`;
            } catch (error) {
                dom.apiStatusMessage.textContent = `Error: ${error.message}`;
                console.error('Error loading tables:', error);
            }
        });
    }
    
    if (dom.apiTableSelect) {
        dom.apiTableSelect.addEventListener('change', () => {
            const provider = dom.apiProviderSelect.value;
            const tableName = dom.apiTableSelect.value;
            
            if (!provider || !tableName) {
                dom.apiAutoToggle.disabled = true;
                dom.apiLiveButton.disabled = true;
                dom.apiRefreshButton.disabled = true;
                dom.apiLoadHistoryButton.disabled = true;
                return;
            }
            
            apiContext.setContext(provider, tableName);
            
            dom.apiAutoToggle.disabled = false;
            dom.apiRefreshButton.disabled = false;
            dom.apiLoadHistoryButton.disabled = false;
            
            if (apiContext.isAutoModeEnabled()) {
                dom.apiLiveButton.disabled = false;
            }
            
            dom.apiStatusMessage.textContent = `Table "${tableName}" selected.`;
        });
    }
    
    if (dom.apiAutoToggle) {
        dom.apiAutoToggle.addEventListener('change', () => {
            const isAutoEnabled = dom.apiAutoToggle.checked;
            apiContext.setAutoMode(isAutoEnabled);
            
            if (isAutoEnabled) {
                const tableName = dom.apiTableSelect.value;
                if (tableName) {
                    dom.apiLiveButton.disabled = false;
                }
                dom.apiStatusMessage.textContent = 'Auto mode enabled. API is now the input source.';
            } else {
                dom.apiLiveButton.disabled = true;
                apiContext.stopLivePolling();
                updateApiLiveButtonState(false);
                dom.apiStatusMessage.textContent = 'Auto mode disabled. Manual input resumed.';
            }
        });
    }
    
    if (dom.apiLiveButton) {
        dom.apiLiveButton.addEventListener('click', () => {
            if (apiContext.isLivePollingActive()) {
                apiContext.stopLivePolling();
                updateApiLiveButtonState(false);
                dom.apiStatusMessage.textContent = 'Live polling stopped.';
            } else {
                startLivePolling();
                updateApiLiveButtonState(true);
                dom.apiStatusMessage.textContent = 'Live polling started (every 2-3 seconds).';
            }
        });
    }
    
    if (dom.apiRefreshButton) {
        dom.apiRefreshButton.addEventListener('click', async () => {
            await handleApiRefresh();
        });
    }
    
    if (dom.apiLoadHistoryButton) {
        dom.apiLoadHistoryButton.addEventListener('click', async () => {
            await handleApiLoadHistory();
        });
    }
}

