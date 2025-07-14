// js/analysis.js

// --- IMPORTS ---
import { calculateTrendStats, getBoardStateStats, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import { aiWorker } from './workers.js';

// --- ANALYSIS FUNCTIONS ---

/**
 * Asynchronously gets a prediction from the AI worker.
 * @param {Array} history - The current history to send for prediction.
 * @returns {Promise<object|null>} A promise that resolves with the prediction data or null.
 */
function getAiPrediction(history) {
    // Immediately return null if the AI isn't ready, to prevent delays.
    if (!state.isAiReady || !aiWorker) {
        return Promise.resolve(null);
    }

    // This Promise will "wrap" the message passing, making it easy to await.
    return new Promise((resolve) => {
        const timeout = 1000; // 1-second timeout

        const timer = setTimeout(() => {
            aiWorker.removeEventListener('message', tempListener);
            console.warn('AI prediction timed out.');
            resolve(null); // Resolve with null if it takes too long
        }, timeout);

        const tempListener = (event) => {
            if (event.data.type === 'predictionResult') {
                clearTimeout(timer); // Cancel the timeout
                aiWorker.removeEventListener('message', tempListener);
                resolve(event.data.probabilities);
            }
        };

        aiWorker.addEventListener('message', tempListener);
        aiWorker.postMessage({ type: 'predict', payload: { history } });
    });
}


export function labelHistoryFailures(sortedHistory) {
    let lastSuccessfulType = null;
    sortedHistory.forEach((item) => {
        if (item.status === 'pending' || item.winningNumber === null) return;
        if (item.status === 'success') {
            item.failureMode = 'none';
            if (item.recommendedGroupId && item.hitTypes.includes(item.recommendedGroupId)) {
                lastSuccessfulType = item.recommendedGroupId;
            }
            return;
        }
        if (item.recommendedGroupId) {
            if (lastSuccessfulType && item.recommendedGroupId === lastSuccessfulType) {
                item.failureMode = 'streakBreak';
            } else if (lastSuccessfulType && item.recommendedGroupId !== lastSuccessfulType) {
                item.failureMode = 'sectionShift';
            } else {
                item.failureMode = 'normalLoss';
            }
        } else {
            item.failureMode = 'normalLoss';
        }
    });
}

function runSimulationOnHistory(spinsToProcess) {
    const localHistory = [];
    let localConfirmedWinsLog = [];
    const localAdaptiveFactorInfluences = { // Initialized to defaults for simulation
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    };
    if (spinsToProcess.length < 3) return [];

    let wins = 0; // Initialize wins for this simulation
    let losses = 0; // Initialize losses for this simulation

    for (let i = 2; i < spinsToProcess.length; i++) {
        const num1 = spinsToProcess[i - 2];
        const num2 = spinsToProcess[i - 1];
        const winningNumber = spinsToProcess[i];
        
        const trendStats = calculateTrendStats(localHistory, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        const boardStats = getBoardStateStats(localHistory, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
        const neighbourScores = runSharedNeighbourAnalysis(localHistory, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);

        const recommendation = getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: num1, inputNum2: num2,
            isForWeightUpdate: false, aiPredictionData: null, currentAdaptiveInfluences: localAdaptiveFactorInfluences,
            lastWinningNumber: localConfirmedWinsLog.length > 0 ? localConfirmedWinsLog[localConfirmedWinsLog.length - 1] : null,
            useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
            useNeighbourFocusBool: state.useNeighbourFocus, isAiReadyBool: false,
            useTrendConfirmationBool: state.useTrendConfirmation, current_STRATEGY_CONFIG: config.STRATEGY_CONFIG, // Use the current config for simulation
            current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: localHistory, // Use current adaptive rates config
            activePredictionTypes: state.activePredictionTypes,
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount, allPredictionTypes: config.allPredictionTypes,
            terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });

        const newHistoryItem = {
            id: Date.now() + i, num1, num2, difference: Math.abs(num2 - num1), status: 'pending', 
            hitTypes: [], typeSuccessStatus: {}, winningNumber, recommendedGroupId: recommendation.bestCandidate?.type.id || null,
            recommendationDetails: recommendation.bestCandidate?.details || null,
            signalType: recommendation.signalType // NEW: Store the explicit signal type
        };

        evaluateCalculationStatus(newHistoryItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
        localHistory.push(newHistoryItem);

        // Update wins/losses for this specific simulation run (only for Play/Strong Play)
        if (newHistoryItem.recommendedGroupId && (newHistoryItem.signalType === 'Play' || newHistoryItem.signalType === 'Strong Play')) {
            if (newHistoryItem.hitTypes && newHistoryItem.hitTypes.includes(newHistoryItem.recommendedGroupId)) {
                wins++;
            } else if (newHistoryItem.winningNumber !== null) { 
                losses++;
            }
        }

        // Apply adaptive influence updates within the simulation
        if (newHistoryItem.recommendedGroupId && newHistoryItem.recommendationDetails?.primaryDrivingFactor) {
            const primaryFactor = newHistoryItem.recommendationDetails.primaryDrivingFactor;
            if (localAdaptiveFactorInfluences[primaryFactor] === undefined) localAdaptiveFactorInfluences[primaryFactor] = 1.0;
            if (newHistoryItem.hitTypes.includes(newHistoryItem.recommendedGroupId)) {
                localAdaptiveFactorInfluences[primaryFactor] = Math.min(config.ADAPTIVE_LEARNING_RATES.MAX_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] + config.ADAPTIVE_LEARNING_RATES.SUCCESS);
            } else {
                localAdaptiveFactorInfluences[primaryFactor] = Math.max(config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] - config.ADAPTIVE_LEARNING_RATES.FAILURE);
            }
        }

        if (winningNumber !== null) {
            localConfirmedWinsLog.push(winningNumber);
        }
    }

    return localHistory;
}

export async function runAllAnalyses(winningNumber = null) {
    state.saveState();

    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);

    ui.renderAnalysisList(neighbourScores);
    ui.renderStrategyWeights();
    ui.renderBoardState(boardStats);

    const num1Val = parseInt(document.getElementById('number1').value, 10);
    const num2Val = parseInt(document.getElementById('number2').value, 10);

    if (!isNaN(num1Val) && !isNaN(num2Val)) {
        ui.updateAiStatus('AI Model: Getting prediction...');
        const aiPredictionData = await getAiPrediction(state.history);
        ui.updateAiStatus(state.isAiReady ? 'AI Model: Ready!' : `AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);

        const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;
        
        const recommendation = getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: num1Val, inputNum2: num2Val,
            isForWeightUpdate: false, 
            aiPredictionData, 
            currentAdaptiveInfluences: state.adaptiveFactorInfluences,
            lastWinningNumber: lastWinning, useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
            useNeighbourFocusBool: state.useNeighbourFocus, 
            isAiReadyBool: state.isAiReady, 
            useTrendConfirmationBool: state.useTrendConfirmation,
            current_STRATEGY_CONFIG: config.STRATEGY_CONFIG, current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES,
            activePredictionTypes: state.activePredictionTypes,
            currentHistoryForTrend: state.history, useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
            allPredictionTypes: config.allPredictionTypes, terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });

        const lastPendingItem = [...state.history].reverse().find(item => item.status === 'pending');
        if (lastPendingItem) {
            lastPendingItem.recommendedGroupId = recommendation.bestCandidate?.type.id || null;
            lastPendingItem.recommendationDetails = recommendation.details;
            lastPendingItem.signalType = recommendation.signalType; // NEW: Update signalType for pending item

            if (winningNumber !== null) {
                evaluateCalculationStatus(lastPendingItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);

                if (lastPendingItem.winningNumber !== null) {
                    const newLog = state.history
                        .filter(item => item.winningNumber !== null)
                        .sort((a, b) => a.id - b.id)
                        .map(item => item.winningNumber);
                    state.setConfirmedWinsLog(newLog);
                }
            }
        }
    }
}

// NEW: Unified function to process a single spin
async function processSingleSpin(num1, num2, winningNumber = null) {
    if (isNaN(num1) || isNaN(num2)) {
        console.warn("Invalid numbers provided for spin processing.");
        return;
    }

    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;

    const recommendation = getRecommendation({
        trendStats, boardStats, neighbourScores, inputNum1: num1, inputNum2: num2,
        isForWeightUpdate: false, aiPredictionData: null, currentAdaptiveInfluences: state.adaptiveFactorInfluences,
        lastWinningNumber: lastWinning, useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
        useNeighbourFocusBool: state.useNeighbourFocus, isAiReadyBool: state.isAiReady,
        useTrendConfirmationBool: state.useTrendConfirmation, current_STRATEGY_CONFIG: config.STRATEGY_CONFIG,
        current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: state.history,
        activePredictionTypes: state.activePredictionTypes,
        useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount, allPredictionTypes: config.allPredictionTypes,
        terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
    });

    const newHistoryItem = {
        id: Date.now() + Math.random(), // Give unique ID
        num1: num1,
        num2: num2,
        difference: Math.abs(num2 - num1),
        status: 'pending', 
        hitTypes: [],
        typeSuccessStatus: {},
        winningNumber: winningNumber,
        pocketDistance: null,
        recommendedGroupId: recommendation.bestCandidate?.type.id || null,
        recommendationDetails: recommendation.details,
        signalType: recommendation.signalType 
    };

    if (winningNumber !== null) {
        evaluateCalculationStatus(newHistoryItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
    }
    
    // Add to history
    state.history.push(newHistoryItem);

    // After updating history, re-run analyses and render UI
    await runAllAnalyses(winningNumber); 
    ui.renderHistory();
    ui.drawRouletteWheel(newHistoryItem.difference, newHistoryItem.winningNumber);

    // If it's a confirmed spin and AI training criteria met, trigger AI training
    const successfulHistoryCount = state.history.filter(item => item.status === 'success').length;
    if (winningNumber !== null && successfulHistoryCount >= config.AI_CONFIG.trainingMinHistory) {
        if (!state.isAiReady) { 
            ui.updateAiStatus('AI Model: Training with new spin...');
            const trendStatsForAI = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
            aiWorker.postMessage({
                type: 'train',
                payload: {
                    history: state.history,
                    historicalStreakData: trendStatsForAI.streakData,
                    terminalMapping: config.terminalMapping,
                    rouletteWheel: config.rouletteWheel
                }
            });
        }
    } else if (winningNumber !== null) { 
        state.setIsAiReady(false);
        ui.updateAiStatus(`AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train. (Current: ${successfulHistoryCount})`);
    }

    return newHistoryItem; // Return the processed item
}

// MODIFIED: handleNewCalculation now calls unified processSingleSpin
function handleNewCalculation() {
    // Removed state.useLiveData check as the card is not implemented
    
    const num1Val = parseInt(document.getElementById('number1').value, 10);
    const num2Val = parseInt(document.getElementById('number2').value, 10);

    if (isNaN(num1Val) || isNaN(num2Val)) {
        document.getElementById('resultDisplay').innerHTML = `<p class="text-red-600 font-medium text-center">Please enter two valid numbers.</p>`;
        document.getElementById('resultDisplay').classList.remove('hidden');
        return;
    }
    processSingleSpin(num1Val, num2Val); // No winningNumber initially for manual calc
}

// MODIFIED: handleSubmitResult now updates existing item and triggers re-analysis
function handleSubmitResult() {
    // Removed state.useLiveData check as the card is not implemented

    const lastPendingItem = [...state.history].reverse().find(item => item.status === 'pending');
    if (!lastPendingItem) {
        alert("Please perform a calculation first before submitting a winning number.");
        return;
    }

    const winningNumberVal = document.getElementById('winningNumberInput').value;
    const winningNumber = winningNumberVal.trim() !== '' ? parseInt(winningNumberVal, 10) : null;

    if (winningNumber === null || isNaN(winningNumber) || winningNumber < 0 || winningNumber > 36) {
        alert("Please enter a valid winning number (0-36).");
        return;
    }

    // Update the last pending item directly with the winning number and re-evaluate
    lastPendingItem.winningNumber = winningNumber;
    evaluateCalculationStatus(lastPendingItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
    
    // Add to confirmedWinsLog and trigger re-analysis/re-render
    state.confirmedWinsLog.push(winningNumber); 
    runAllAnalyses(winningNumber); 
    ui.renderHistory();

    document.getElementById('winningNumberInput').value = '';

    const prevNum2 = parseInt(lastPendingItem.num2, 10);
    if (!isNaN(prevNum2)) {
        document.getElementById('number1').value = prevNum2;
        document.getElementById('number2').value = winningNumber;
        setTimeout(() => {
            handleNewCalculation(); 
        }, 50);
    }
}


export async function handleHistoricalAnalysis() {
    const historicalNumbersInput = document.getElementById('historicalNumbersInput');
    const historicalAnalysisMessage = document.getElementById('historicalAnalysisMessage');
    
    historicalAnalysisMessage.textContent = 'Processing...';
    const numbers = historicalNumbersInput.value.trim().split(/[\s,]+/).filter(Boolean).map(Number);

    if (numbers.length < 3 || numbers.some(n => isNaN(n) || n < 0 || n > 36)) {
        historicalAnalysisMessage.textContent = 'Please provide at least 3 valid numbers (0-36).';
        return;
    }

    const historicalSpinsChronological = numbers.slice().reverse();
    // Simulate each spin individually to build up history correctly, including recommendations and adaptive influences
    state.setHistory([]); // Clear history before re-simulating
    state.setConfirmedWinsLog([]); // Clear confirmed log
    state.setPatternMemory({}); // Clear pattern memory
    state.setAdaptiveFactorInfluences({ // Reset adaptive influences
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    });

    for (let i = 2; i < historicalSpinsChronological.length; i++) {
        const num1 = historicalSpinsChronological[i - 2];
        const num2 = historicalSpinsChronological[i - 1];
        const winningNumber = historicalSpinsChronological[i];
        await processSingleSpin(num1, num2, winningNumber); // Process each as a non-live spin
    }
    
    historicalAnalysisMessage.textContent = `Successfully processed and simulated ${state.history.length} entries.`;
    labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id)); // Label failures after history is built
    ui.renderHistory(); // Final render after full simulation
    ui.drawRouletteWheel(); // Update wheel after full simulation
    
    const successfulHistoryCount = state.history.filter(item => item.status === 'success').length;
    if (successfulHistoryCount >= config.AI_CONFIG.trainingMinHistory) {
        state.setIsAiReady(false);
        ui.updateAiStatus('AI Model: Training...');
        const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel); 
        aiWorker.postMessage({ 
            type: 'train', 
            payload: { 
                history: state.history,
                historicalStreakData: trendStats.streakData,
                terminalMapping: config.terminalMapping,
                rouletteWheel: config.rouletteWheel
            } 
        });
    } else {
        state.setIsAiReady(false);
        ui.updateAiStatus(`AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train. (Current: ${successfulHistoryCount})`);
    }
}


export async function handleStrategyChange() {
    const currentWinningNumbers = state.history.filter(item => item.winningNumber !== null).map(item => item.winningNumber);

    // To properly re-evaluate, we need to re-simulate the entire confirmed history
    // with the new strategy settings applied.
    state.setHistory([]); // Clear current history
    state.setConfirmedWinsLog([]); // Clear confirmed log
    state.setPatternMemory({}); // Reset pattern memory
    state.setAdaptiveFactorInfluences({ // Reset adaptive influences
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    });

    if (currentWinningNumbers.length >= 3) {
        // Re-process each spin with the new strategy
        for (let i = 2; i < currentWinningNumbers.length; i++) {
            const num1 = currentWinningNumbers[i - 2];
            const num2 = currentWinningNumbers[i - 1];
            const winningNumber = currentWinningNumbers[i];
            await processSingleSpin(num1, num2, winningNumber);
        }
    }
    
    // After re-simulation, update analysis and UI
    labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));
    await runAllAnalyses();
    ui.renderHistory();

    // Redraw wheel based on current inputs/last spin
    const num1Val = parseInt(document.getElementById('number1').value, 10);
    const num2Val = parseInt(document.getElementById('number2').value, 10);
    const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length-1] : null;
    ui.drawRouletteWheel(!isNaN(num1Val) && !isNaN(num2Val) ? Math.abs(num2Val-num1Val) : null, lastWinning);
}

// FIX: Renamed to be more specific. This is for retraining on load.
export function trainAiOnLoad() {
    if (!aiWorker || !state.isAiReady) return;

    const successfulHistoryCount = state.history.filter(item => item.status === 'success').length;
    if (successfulHistoryCount < config.AI_CONFIG.trainingMinHistory) {
        ui.updateAiStatus(`AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);
        return;
    }

    ui.updateAiStatus('AI Model: Re-training with loaded history...');
    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);

    aiWorker.postMessage({
        type: 'train',
        payload: {
            history: state.history,
            historicalStreakData: trendStats.streakData,
            terminalMapping: config.terminalMapping,
            rouletteWheel: config.rouletteWheel
        }
    });
}

// FIX: New function to properly initialize the AI worker on startup.
export function initializeAi() {
    if (!aiWorker) return;
    const savedScaler = localStorage.getItem('roulette-ml-scaler');
    aiWorker.postMessage({
        type: 'init',
        payload: {
            scaler: savedScaler,
            terminalMapping: config.terminalMapping,
            rouletteWheel: config.rouletteWheel
        }
    });
}
