// js/ui.events.js

// --- IMPORTS ---
import { getHitZone, calculateTrendStats, getBoardStateStats, calculatePocketDistance, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import { aiWorker, optimizationWorker } from './workers.js';
import * as analysis from './analysis.js';
import * as winspinApi from './api/winspin.js';
import { apiContext } from './api/apiContextManager.js';
import { dom, toggleGuide, hidePatternAlert, updateApiLiveButtonState, addTrainingLogEntry, clearTrainingLog, toggleTrainingLog, updateHistoricalDataIndicator } from './ui.helpers.js';
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

// --- HELPER FUNCTION ---
/**
 * Wraps a base number to valid roulette range (0-36)
 * Numbers > 36 are wrapped using modulo 37
 * Numbers < 0 are handled by taking absolute value first
 * @param {number} baseNum - The calculated base number
 * @returns {number} The wrapped number in range 0-36
 */
function wrapBaseNumber(baseNum) {
    if (baseNum < 0) {
        return ((baseNum % 37) + 37) % 37;
    }
    if (baseNum > 36) {
        return baseNum % 37;
    }
    return baseNum;
}

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
    console.log(`handleNewCalculation: New history item created with ID: ${newHistoryItem.id}. Setting as currentPendingCalculationId.`);
    state.setCurrentPendingCalculationId(newHistoryItem.id);

    analysis.runAllAnalyses();
    renderHistory();
    updateMainRecommendationDisplay();
    state.saveState();
}

/**
 * Handles the "Submit Result" button click.
 */
export async function handleSubmitResult() {
    console.log("handleSubmitResult: Function started.");
    const winningNumberVal = parseInt(dom.winningNumberInput.value, 10);

    if (isNaN(winningNumberVal) || winningNumberVal < 0 || winningNumberVal > 36) {
        alert("Please enter a valid winning number (0-36).");
        return;
    }

    const pendingItemId = state.currentPendingCalculationId;
    if (pendingItemId === null) {
        alert("No pending calculation to submit a result for. Please enter numbers and click 'Calculate' first.");
        return;
    }

    const pendingItem = state.history.find(item => item.id === pendingItemId);

    if (!pendingItem) {
        console.error(`handleSubmitResult: No pending item found with ID: ${pendingItemId}. This indicates a state mismatch.`);
        alert("Error: Could not find the pending calculation. Please try again.");
        state.setCurrentPendingCalculationId(null);
        return;
    }

    console.log(`handleSubmitResult: Evaluating pending item ID: ${pendingItem.id} with winning number: ${winningNumberVal}`);

    // Get the current recommendation *before* updating the item's status
    const recommendationBeforeResult = await getRecommendationDataForDisplay(pendingItem.num1, pendingItem.num2);
    
    // Store recommendation details on the item
    if (recommendationBeforeResult.bestCandidate) {
        pendingItem.recommendedGroupId = recommendationBeforeResult.bestCandidate.type.id;
        pendingItem.recommendationDetails = recommendationBeforeResult.bestCandidate.details;
    }
    // FIX: Use wrapped base numbers for hit zone calculation
    evaluateCalculationStatus(pendingItem, winningNumberVal, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
    
    // Update adaptive influences based on result
    if (pendingItem.recommendedGroupId && pendingItem.recommendationDetails?.primaryDrivingFactor) {
        const primaryFactor = pendingItem.recommendationDetails.primaryDrivingFactor;
        const influenceChangeMagnitude = Math.max(0, pendingItem.recommendationDetails.finalScore - config.ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MIN_THRESHOLD) * config.ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MULTIPLIER;

        if (state.adaptiveFactorInfluences[primaryFactor] === undefined) {
            state.adaptiveFactorInfluences[primaryFactor] = 1.0;
        }

        if (pendingItem.recommendationDetails.finalScore > 0 && pendingItem.recommendationDetails.signal !== 'Avoid Play') {
            if (pendingItem.hitTypes.includes(pendingItem.recommendedGroupId)) {
                state.adaptiveFactorInfluences[primaryFactor] = Math.min(
                    config.ADAPTIVE_LEARNING_RATES.MAX_INFLUENCE,
                    state.adaptiveFactorInfluences[primaryFactor] + (config.ADAPTIVE_LEARNING_RATES.SUCCESS + influenceChangeMagnitude)
                );
            } else {
                state.adaptiveFactorInfluences[primaryFactor] = Math.max(
                    config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE,
                    state.adaptiveFactorInfluences[primaryFactor] - (config.ADAPTIVE_LEARNING_RATES.FAILURE + influenceChangeMagnitude)
                );
            }
        }
    }

    // Apply forget factor to all adaptive influences
    for (const factorName in state.adaptiveFactorInfluences) {
        state.adaptiveFactorInfluences[factorName] = Math.max(
            config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE,
            state.adaptiveFactorInfluences[factorName] * config.ADAPTIVE_LEARNING_RATES.FORGET_FACTOR
        );
    }

    state.confirmedWinsLog.push(winningNumberVal);
    state.setCurrentPendingCalculationId(null);
    dom.winningNumberInput.value = '';

    // AI training check
    const confirmedCount = state.history.filter(item => item.winningNumber !== null && item.status !== 'pending').length;
    if (confirmedCount >= config.AI_CONFIG.trainingMinHistory && !state.isAiReady) {
        analysis.initializeAi();
    }

    console.log("handleSubmitResult: Result submitted. Running all analyses.");
    analysis.runAllAnalyses();
    renderHistory();
    await updateMainRecommendationDisplay();
    updateWinLossCounter();
    renderStrategyWeights();
    state.saveState();
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
        
        // Get context provider if available - works even without AI training
        const contextProvider = apiContext.hasAnyContextData() ? apiContext : null;
        
        const recommendation = getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: num1, inputNum2: num2,
            isForWeightUpdate: false, aiPredictionData: null, currentAdaptiveInfluences: localAdaptiveFactorInfluences,
            lastWinningNumber: localConfirmedWinsLog.length > 0 ? localConfirmedWinsLog[localConfirmedWinsLog.length - 1] : null,
            useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
            useNeighbourFocusBool: state.useNeighbourFocus, isAiReadyBool: false,
            useTrendConfirmationBool: state.useTrendConfirmation,
            useAdaptivePlayBool: state.useAdaptivePlay,
            useLessStrictBool: state.useLessStrict,
            useTableChangeWarningsBool: state.useTableChangeWarnings,
            rollingPerformance: null, factorShiftStatus: null,
            useLowestPocketDistanceBool: state.useLowestPocketDistance,
            isCurrentRepeat: false, isCurrentNeighborHit: false,
            sectorContextProvider: contextProvider,
            current_STRATEGY_CONFIG: config.STRATEGY_CONFIG,
            current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES,
            activePredictionTypes: state.activePredictionTypes,
            currentHistoryForTrend: localHistory,
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
            allPredictionTypes: config.allPredictionTypes, terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });
        
        const newHistoryItem = {
            id: Date.now() + i,
            num1: num1, num2: num2, difference: Math.abs(num2 - num1),
            status: 'pending', hitTypes: [], typeSuccessStatus: {}, winningNumber: null, pocketDistance: null,
            recommendedGroupId: recommendation.bestCandidate ? recommendation.bestCandidate.type.id : null,
            recommendationDetails: recommendation.bestCandidate ? recommendation.bestCandidate.details : null
        };
        
        evaluateCalculationStatus(newHistoryItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
        
        if (newHistoryItem.recommendedGroupId && newHistoryItem.recommendationDetails?.primaryDrivingFactor) {
            const primaryFactor = newHistoryItem.recommendationDetails.primaryDrivingFactor;
            const influenceChangeMagnitude = Math.max(0, newHistoryItem.recommendationDetails.finalScore - config.ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MIN_THRESHOLD) * config.ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MULTIPLIER;
            
            if (localAdaptiveFactorInfluences[primaryFactor] === undefined) {
                localAdaptiveFactorInfluences[primaryFactor] = 1.0;
            }
            
            if (newHistoryItem.recommendationDetails.finalScore > 0 && newHistoryItem.recommendationDetails.signal !== 'Avoid Play') {
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
        }
        
        localHistory.push(newHistoryItem);
        localConfirmedWinsLog.push(winningNumber);
    }
    
    return localHistory;
}

async function loadApiHistoryIntoApp(spins, tableName) {
    if (spins.length < 3) {
        dom.apiStatusMessage.textContent = 'Not enough spins to process (need at least 3).';
        return;
    }
    
    const simulatedHistory = runSimulationOnHistory(spins);
    
    if (simulatedHistory.length === 0) {
        dom.apiStatusMessage.textContent = 'Failed to simulate history from spins.';
        return;
    }
    
    state.history.length = 0;
    state.history.push(...simulatedHistory);
    
    state.confirmedWinsLog.length = 0;
    spins.slice(2).forEach(spin => state.confirmedWinsLog.push(spin));
    
    state.setCurrentPendingCalculationId(null);
    
    const latestSpins = spins.slice(0, 2);
    if (latestSpins.length >= 2) {
        dom.number1.value = latestSpins[1];
        dom.number2.value = latestSpins[0];
    }
    
    analysis.runAllAnalyses();
    renderHistory();
    await updateMainRecommendationDisplay();
    updateWinLossCounter();
    renderStrategyWeights();
    state.saveState();
    
    dom.apiStatusMessage.textContent = `Loaded ${simulatedHistory.length} items from ${tableName}.`;
}

export function attachInputListeners() {
    dom.number1.addEventListener('input', () => {
        const num1Val = parseInt(dom.number1.value, 10);
        const num2Val = parseInt(dom.number2.value, 10);
        const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;
        // FIX: Use wrapped result number
        const wrappedResult = (!isNaN(num1Val) && !isNaN(num2Val)) ? wrapBaseNumber(Math.abs(num2Val - num1Val)) : null;
        drawRouletteWheel(wrappedResult, lastWinning);
        updateMainRecommendationDisplay();
    });
    dom.number2.addEventListener('input', () => {
        const num1Val = parseInt(dom.number1.value, 10);
        const num2Val = parseInt(dom.number2.value, 10);
        const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;
        // FIX: Use wrapped result number
        const wrappedResult = (!isNaN(num1Val) && !isNaN(num2Val)) ? wrapBaseNumber(Math.abs(num2Val - num1Val)) : null;
        drawRouletteWheel(wrappedResult, lastWinning);
        updateMainRecommendationDisplay();
    });

    document.getElementById('calculateButton').addEventListener('click', () => handleNewCalculation());
    dom.submitResultButton.addEventListener('click', handleSubmitResult);
    document.getElementById('swapButton').addEventListener('click', () => {
        const temp = dom.number1.value;
        dom.number1.value = dom.number2.value;
        dom.number2.value = temp;
        const num1Val = parseInt(dom.number1.value, 10);
        const num2Val = parseInt(dom.number2.value, 10);
        const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;
        // FIX: Use wrapped result number
        const wrappedResult = (!isNaN(num1Val) && !isNaN(num2Val)) ? wrapBaseNumber(Math.abs(num2Val - num1Val)) : null;
        drawRouletteWheel(wrappedResult, lastWinning);
        updateMainRecommendationDisplay();
    });
    document.getElementById('clearHistoryButton').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all history?')) {
            state.history.length = 0;
            state.confirmedWinsLog.length = 0;
            state.setCurrentPendingCalculationId(null);
            state.resetAdaptiveFactorInfluences();
            state.resetStrategyStates();
            state.resetPatternMemory();
            analysis.runAllAnalyses();
            renderHistory();
            updateMainRecommendationDisplay();
            updateWinLossCounter();
            renderStrategyWeights();
            state.saveState();
        }
    });

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
    // FIX: Worker handler for optimization progress/completion/stopped/error
    // Previously this was missing 'stopped' and 'error' handlers
    optimizationWorker.onmessage = function (e) {
        const { type, payload } = e.data;
        
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
                if (payload.debugMetrics) {
                    updateOptimizerDebugPanel(payload.debugMetrics);
                }
                break;
                
            case 'complete':
                showOptimizationComplete(payload);
                state.setBestFoundParams(payload);
                if (payload.debugMetrics) {
                    updateOptimizerDebugPanel(payload.debugMetrics);
                }
                break;
                
            case 'stopped':
                // FIX: This case was missing - now properly handles stop
                showOptimizationStopped();
                console.log("Optimization stopped by worker.");
                break;
                
            case 'error':
                // FIX: This case was missing - now properly handles errors
                const errorHtml = `<span style="color: #ef4444;"><strong>Error:</strong> ${payload.message}</span>`;
                updateOptimizationStatus(errorHtml);
                showOptimizationStopped();
                console.error("Optimization error:", payload.message);
                break;
                
            default:
                console.warn("Unknown message type from optimization worker:", type);
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
            // Immediately update UI to show stopping state
            updateOptimizationStatus('Stopping optimization...');
        });
    }

    if (dom.applyBestParamsButton) {
        dom.applyBestParamsButton.addEventListener('click', () => {
            console.log("Apply Best Params button clicked.");
            const bestFoundParams = state.bestFoundParams;
            // FIX: The payload uses 'bestIndividual' not 'params', and 'togglesUsed' not 'toggles'
            if (bestFoundParams && bestFoundParams.bestIndividual) {
                const params = bestFoundParams.bestIndividual;
                const toggles = bestFoundParams.togglesUsed;
                
                Object.assign(config.STRATEGY_CONFIG, {
                    learningRate_success: params.learningRate_success,
                    learningRate_failure: params.learningRate_failure,
                    maxWeight: params.maxWeight,
                    minWeight: params.minWeight,
                    decayFactor: params.decayFactor,
                    patternMinAttempts: params.patternMinAttempts,
                    patternSuccessThreshold: params.patternSuccessThreshold,
                    triggerMinAttempts: params.triggerMinAttempts,
                    triggerSuccessThreshold: params.triggerSuccessThreshold,
                    hitRateThreshold: params.hitRateThreshold,
                    hitRateMultiplier: params.hitRateMultiplier,
                    streakMultiplier: params.streakMultiplier,
                    maxStreakPoints: params.maxStreakPoints,
                    proximityMaxDistance: params.proximityMaxDistance,
                    proximityMultiplier: params.proximityMultiplier,
                    neighbourMultiplier: params.neighbourMultiplier,
                    maxNeighbourPoints: params.maxNeighbourPoints,
                    aiConfidenceMultiplier: params.aiConfidenceMultiplier,
                    minAiPointsForReason: params.minAiPointsForReason,
                    ADAPTIVE_STRONG_PLAY_THRESHOLD: params.ADAPTIVE_STRONG_PLAY_THRESHOLD,
                    ADAPTIVE_PLAY_THRESHOLD: params.ADAPTIVE_PLAY_THRESHOLD,
                    SIMPLE_PLAY_THRESHOLD: params.SIMPLE_PLAY_THRESHOLD,
                    LESS_STRICT_STRONG_PLAY_THRESHOLD: params.LESS_STRICT_STRONG_PLAY_THRESHOLD,
                    LESS_STRICT_PLAY_THRESHOLD: params.LESS_STRICT_PLAY_THRESHOLD,
                    LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: params.LESS_STRICT_HIGH_HIT_RATE_THRESHOLD,
                    LESS_STRICT_MIN_STREAK: params.LESS_STRICT_MIN_STREAK,
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
                    SUCCESS: params.adaptiveSuccessRate,
                    FAILURE: params.adaptiveFailureRate,
                    MIN_INFLUENCE: params.minAdaptiveInfluence,
                    MAX_INFLUENCE: params.maxAdaptiveInfluence,
                    FORGET_FACTOR: params.FORGET_FACTOR,
                    CONFIDENCE_WEIGHTING_MULTIPLIER: params.CONFIDENCE_WEIGHTING_MULTIPLIER,
                    CONFIDENCE_WEIGHTING_MIN_THRESHOLD: params.CONFIDENCE_WEIGHTING_MIN_THRESHOLD
                });

                if (toggles) {
                    state.setToggles(toggles);
                    updateAllTogglesUI();
                    analysis.updateActivePredictionTypes();
                }

                initializeAdvancedSettingsUI();
                updateOptimizationStatus('Best parameters applied!');
                analysis.handleStrategyChange();
                hidePatternAlert();
                updateMainRecommendationDisplay();
            } else {
                console.warn("Apply Best Params: No bestIndividual found in bestFoundParams.", bestFoundParams);
                updateOptimizationStatus('Error: No optimization results to apply.');
            }
            console.log("Apply Best Params: Settings applied and UI updated.");
        });
    }

    // Debug panel toggle
    if (dom.optimizerDebugToggle || dom.optimizerDebugHeader) {
        const toggleElement = dom.optimizerDebugToggle || dom.optimizerDebugHeader;
        toggleElement.addEventListener('click', () => {
            if (dom.optimizerDebugContent) {
                dom.optimizerDebugContent.classList.toggle('open');
                if (dom.optimizerDebugToggle) {
                    const isOpen = dom.optimizerDebugContent.classList.contains('open');
                    dom.optimizerDebugToggle.textContent = isOpen ? 'Hide Debug ^' : 'Show Debug v';
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
            const newToggleStates = { 
                useTrendConfirmation: state.useTrendConfirmation,
                useWeightedZone: state.useWeightedZone,
                useProximityBoost: state.useProximityBoost,
                usePocketDistance: state.usePocketDistance,
                useLowestPocketDistance: state.useLowestPocketDistance,
                useAdvancedCalculations: state.useAdvancedCalculations,
                useDynamicStrategy: state.useDynamicStrategy,
                useAdaptivePlay: state.useAdaptivePlay,
                useTableChangeWarnings: state.useTableChangeWarnings,
                useDueForHit: state.useDueForHit,
                useNeighbourFocus: state.useNeighbourFocus,
                useLessStrict: state.useLessStrict,
                useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount
            };
            newToggleStates[stateKey] = dom[toggleId].checked;
            state.setToggles(newToggleStates);
            state.saveState();

            if (stateKey === 'useAdvancedCalculations') {
                analysis.updateActivePredictionTypes();
            }

            if (stateKey === 'usePocketDistance') {
                renderHistory();
            } else {
                analysis.handleStrategyChange();
                const num1Val = parseInt(dom.number1.value, 10);
                const num2Val = parseInt(document.getElementById('number2').value, 10);
                const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length-1] : null;
                // FIX: Use wrapped result number
                const wrappedResult = (!isNaN(num1Val) && !isNaN(num2Val)) ? wrapBaseNumber(Math.abs(num2Val - num1Val)) : null;
                drawRouletteWheel(wrappedResult, lastWinning);
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
            
            dom.apiTableSelect.innerHTML = '<option value="">Loading tables...</option>';
            dom.apiTableSelect.disabled = true;
            dom.apiAutoToggle.disabled = true;
            dom.apiLiveButton.disabled = true;
            dom.apiRefreshButton.disabled = true;
            dom.apiLoadHistoryButton.disabled = true;
            updateHistoricalDataIndicator(null);
            
            if (!provider) {
                dom.apiTableSelect.innerHTML = '<option value="">Select Table</option>';
                dom.apiStatusMessage.textContent = 'Select a provider to begin';
                return;
            }
            
            try {
                dom.apiStatusMessage.textContent = `Loading ${provider} tables...`;
                
                // Fetch with historical max data for context calibration
                const apiResponse = await winspinApi.fetchRouletteDataWithLosses(provider);
                apiContext.setLastApiResponse(apiResponse);
                
                const tables = winspinApi.extractTableNames(apiResponse);
                
                dom.apiTableSelect.innerHTML = '<option value="">Select Table</option>';
                
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
                updateHistoricalDataIndicator(null);
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
                const provider = dom.apiProviderSelect.value;
                const tableName = dom.apiTableSelect.value;
                
                if (!provider || !tableName) {
                    dom.apiStatusMessage.textContent = 'Please select a provider and table first.';
                    return;
                }
                
                apiContext.startLivePolling(provider, tableName, async (newSpin) => {
                    console.log('Live spin received:', newSpin);
                    
                    const num1Val = parseInt(dom.number1.value, 10);
                    const num2Val = parseInt(dom.number2.value, 10);
                    
                    if (!isNaN(num1Val) && !isNaN(num2Val)) {
                        const pendingItemId = state.currentPendingCalculationId;
                        if (pendingItemId !== null) {
                            dom.winningNumberInput.value = newSpin;
                            await handleSubmitResult();
                        }
                    }
                    
                    const recentSpins = apiContext.getRecentSpins(2);
                    if (recentSpins.length >= 2) {
                        dom.number1.value = recentSpins[1];
                        dom.number2.value = recentSpins[0];
                        handleNewCalculation(true);
                    }
                });
                
                updateApiLiveButtonState(true);
                dom.apiStatusMessage.textContent = 'Live polling started...';
            }
        });
    }
    
    if (dom.apiRefreshButton) {
        dom.apiRefreshButton.addEventListener('click', async () => {
            const provider = dom.apiProviderSelect.value;
            const tableName = dom.apiTableSelect.value;
            
            if (!provider || !tableName) {
                dom.apiStatusMessage.textContent = 'Please select a provider and table first.';
                return;
            }
            
            try {
                dom.apiStatusMessage.textContent = 'Refreshing data...';
                
                // Fetch with historical max for context calibration
                const apiResponse = await winspinApi.fetchRouletteDataWithLosses(provider);
                apiContext.setLastApiResponse(apiResponse);
                
                // Update sector context
                const sectorLosses = winspinApi.getSectorLosses(apiResponse, tableName);
                if (sectorLosses) {
                    apiContext.updateSectorContext(sectorLosses);
                }
                
                // Update number context
                const numberLosses = winspinApi.getNumberLosses(apiResponse, tableName);
                if (numberLosses) {
                    apiContext.updateNumberContext(numberLosses);
                }
                
                // Update historical data indicator
                updateHistoricalDataIndicator(apiContext.getDataSourceStatus());
                
                const spins = winspinApi.getTableHistory(apiResponse, tableName, 2);
                
                if (spins.length >= 2) {
                    dom.number1.value = spins[1];
                    dom.number2.value = spins[0];
                    updateMainRecommendationDisplay();
                }
                
                dom.apiStatusMessage.textContent = `Data refreshed. Latest numbers: ${spins.slice(0, 5).join(', ')}`;
            } catch (error) {
                dom.apiStatusMessage.textContent = `Error: ${error.message}`;
                console.error('Error refreshing data:', error);
            }
        });
    }
    
    if (dom.apiLoadHistoryButton) {
        dom.apiLoadHistoryButton.addEventListener('click', async () => {
            const provider = dom.apiProviderSelect.value;
            const tableName = dom.apiTableSelect.value;
            
            if (!provider || !tableName) {
                dom.apiStatusMessage.textContent = 'Please select a provider and table first.';
                return;
            }
            
            const confirmed = confirm(
                'This will replace your current history with the last 30 spins from the API. Continue?'
            );
            
            if (!confirmed) {
                return;
            }
            
            try {
                dom.apiStatusMessage.textContent = 'Loading history with context data...';
                
                // Fetch with losses data for context
                const apiResponse = await winspinApi.fetchRouletteDataWithLosses(provider);
                apiContext.setLastApiResponse(apiResponse);
                
                // Update sector context from losses data
                const sectorLosses = winspinApi.getSectorLosses(apiResponse, tableName);
                if (sectorLosses) {
                    const success = apiContext.updateSectorContext(sectorLosses);
                    if (success) {
                        addTrainingLogEntry('info', `Sector context loaded (${sectorLosses.dataQuality})`);
                        if (sectorLosses.hasHistoricalMax) {
                            addTrainingLogEntry('success', 'Historical max data (5+ years) available for sector calibration');
                        } else {
                            addTrainingLogEntry('warning', 'Sector historical max data not available - using session data only');
                        }
                    }
                } else {
                    addTrainingLogEntry('warning', 'No sector losses data in API response');
                }
                
                // Update number-level context from losses data
                const numberLosses = winspinApi.getNumberLosses(apiResponse, tableName);
                if (numberLosses) {
                    const success = apiContext.updateNumberContext(numberLosses);
                    if (success) {
                        addTrainingLogEntry('info', `Number context loaded (${numberLosses.dataQuality})`);
                        if (numberLosses.hasHistoricalMax) {
                            addTrainingLogEntry('success', 'Historical max data (5+ years) available for number calibration');
                        } else {
                            addTrainingLogEntry('warning', 'Number historical max data not available - using session data only');
                        }
                    }
                } else {
                    addTrainingLogEntry('info', 'Number-level context not available from API');
                }
                
                // Update historical data indicator
                updateHistoricalDataIndicator(apiContext.getDataSourceStatus());
                
                const spins = winspinApi.getTableHistory(apiResponse, tableName);
                
                if (spins.length === 0) {
                    dom.apiStatusMessage.textContent = 'No spins available for this table.';
                    return;
                }
                
                await loadApiHistoryIntoApp(spins, tableName);
                
            } catch (error) {
                dom.apiStatusMessage.textContent = `Error: ${error.message}`;
                console.error('Error loading history:', error);
            }
        });
    }
}

function resetAllParameters() {
    if (confirm('Are you sure you want to reset all parameters to defaults?')) {
        Object.assign(config.STRATEGY_CONFIG, config.DEFAULT_PARAMETERS.STRATEGY_CONFIG);
        Object.assign(config.ADAPTIVE_LEARNING_RATES, config.DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES);
        initializeAdvancedSettingsUI();
        dom.parameterStatusMessage.textContent = 'Parameters reset to defaults.';
        analysis.handleStrategyChange();
        updateMainRecommendationDisplay();
        state.saveState();
    }
}

function saveParametersToFile() {
    const params = {
        STRATEGY_CONFIG: config.STRATEGY_CONFIG,
        ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES
    };
    const blob = new Blob([JSON.stringify(params, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roulette-parameters.json';
    a.click();
    URL.revokeObjectURL(url);
    dom.parameterStatusMessage.textContent = 'Parameters saved to file.';
}

function loadParametersFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const params = JSON.parse(e.target.result);
            if (params.STRATEGY_CONFIG) {
                Object.assign(config.STRATEGY_CONFIG, params.STRATEGY_CONFIG);
            }
            if (params.ADAPTIVE_LEARNING_RATES) {
                Object.assign(config.ADAPTIVE_LEARNING_RATES, params.ADAPTIVE_LEARNING_RATES);
            }
            initializeAdvancedSettingsUI();
            dom.parameterStatusMessage.textContent = 'Parameters loaded from file.';
            analysis.handleStrategyChange();
            updateMainRecommendationDisplay();
            state.saveState();
        } catch (error) {
            dom.parameterStatusMessage.textContent = 'Error loading parameters: Invalid file format.';
            console.error('Error loading parameters:', error);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}