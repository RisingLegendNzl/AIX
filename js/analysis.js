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

// NOTE: This is the original runSimulationOnHistory logic (not the unified processSingleSpin)
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
            recommendationDetails: recommendation.bestCandidate?.details || null
            // signalType is NOT stored here
        };

        evaluateCalculationStatus(newHistoryItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
        localHistory.push(newHistoryItem);

        // Original win/loss counting logic (counts any recommendation)
        if (newHistoryItem.recommendedGroupId && newHistoryItem.hitTypes.includes(newHistoryItem.recommendedGroupId)) {
            wins++;
        } else if (newHistoryItem.recommendedGroupId) { 
            losses++;
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
            // signalType is NOT set here
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

// Removed processSingleSpin - reverted to direct calls from handleNewCalculation, handleSubmitResult, handleHistoricalAnalysis
// Removed handleLiveSpin - as it was tied to the unified processSingleSpin and live data card

export function handleNewCalculation() {
    if (!document.getElementById('number1') || !document.getElementById('number2') || !document.getElementById('resultDisplay')) return;

    const num1Val = parseInt(document.getElementById('number1').value, 10);
    const num2Val = parseInt(document.getElementById('number2').value, 10);

    if (isNaN(num1Val) || isNaN(num2Val)) {
        document.getElementById('resultDisplay').innerHTML = `<p class="text-red-600 font-medium text-center">Please enter two valid numbers.</p>`;
        document.getElementById('resultDisplay').classList.remove('hidden');
        return;
    }

    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const lastWinningNumber = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;

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

    const aiPredictionData = null; // AI prediction will come later via runAllAnalyses
    const recommendation = getRecommendation({
        trendStats, boardStats, neighbourScores, inputNum1: num1Val, inputNum2: num2Val,
        isForWeightUpdate: false, aiPredictionData: aiPredictionData, currentAdaptiveInfluences: state.adaptiveFactorInfluences,
        lastWinningNumber: lastWinningNumber, useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
        useNeighbourFocusBool: state.useNeighbourFocus, isAiReadyBool: state.isAiReady,
        useTrendConfirmationBool: state.useTrendConfirmation, current_STRATEGY_CONFIG: config.STRATEGY_CONFIG,
        current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: state.history,
        activePredictionTypes: state.activePredictionTypes,
        useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount, allPredictionTypes: config.allPredictionTypes,
        terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
    });

    newHistoryItem.recommendedGroupId = recommendation.bestCandidate?.type.id || null;
    newHistoryItem.recommendationDetails = recommendation.details;
    // signalType is NOT set here

    let fullResultHtml = `
        <h3 class="text-lg font-bold text-gray-800 mb-2">Recommendation</h3>
        <div class="result-display p-4 bg-gray-50 border border-gray-200 rounded-lg mb-4 text-center">
            ${recommendation.html}
        </div>
        <h3 class="text-lg font-bold text-gray-800 mb-2">Calculation Groups</h3>
        <div class="space-y-2">
    `;

    state.activePredictionTypes.forEach(type => {
        const predictionTypeDefinition = config.allPredictionTypes.find(t => t.id === type.id);
        if (!predictionTypeDefinition) return;

        const baseNum = predictionTypeDefinition.calculateBase(num1Val, num2Val);
        if (baseNum < 0 || baseNum > 36) return;

        const terminals = config.terminalMapping?.[baseNum] || [];
        
        const streak = trendStats.currentStreaks[type.id] || 0;
        let confirmedByHtml = '';
        if (streak >= 2) {
            confirmedByHtml = ` <strong style="color: #16a34a;">- Confirmed by ${streak}</strong>`;
        }

        const stats = boardStats[type.id] || { success: 0, total: 0 };
        const hitRate = stats.total > 0 ? (stats.success / stats.total * 100) : 0;
        let pocketDistanceHtml = '';

        if (state.usePocketDistance && lastWinningNumber !== null) {
            const hitZone = getHitZone(baseNum, terminals, lastWinningNumber, state.useDynamicTerminalNeighbourCount, config.terminalMapping, config.rouletteWheel);
            let minDistance = Infinity;
            if (hitZone.length > 0) {
                hitZone.forEach(zoneNum => {
                    const dist = calculatePocketDistance(zoneNum, lastWinningNumber, config.rouletteWheel);
                    if (dist < minDistance) minDistance = dist;
                });
            }
            if(minDistance !== Infinity) {
                 pocketDistanceHtml = `<span class="text-pink-500">Dist: <strong>${minDistance}</strong></span>`;
            }
        }

        fullResultHtml += `
            <div class="p-3 rounded-lg border" style="border-color: ${type.textColor || '#e2e8f0'};">
                <strong style="color: ${type.textColor || '#1f2937'};">${type.displayLabel} (Base: ${baseNum})</strong>
                <p class="text-sm text-gray-600">Terminals: ${terminals.join(', ') || 'None'}${confirmedByHtml}</p>
                <div class="group-stats">
                    <span>Hit Rate: <strong>${hitRate.toFixed(1)}%</strong></span>
                    ${pocketDistanceHtml}
                </div>
            </div>
        `;
    });

    fullResultHtml += '</div>';
    document.getElementById('resultDisplay').innerHTML = fullResultHtml;
    document.getElementById('resultDisplay').classList.remove('hidden');

    runAllAnalyses();
    ui.renderHistory();
    ui.drawRouletteWheel(newHistoryItem.difference, lastWinningNumber);
}


export function handleSubmitResult() {
    if (!document.getElementById('winningNumberInput') || !document.getElementById('number1') || !document.getElementById('number2')) return;

    const lastItem = [...state.history].reverse().find(item => item.status === 'pending');
    if (!lastItem) {
        alert("Please perform a calculation first before submitting a winning number.");
        return;
    }

    const winningNumberVal = document.getElementById('winningNumberInput').value;
    let winningNumber = null;
    if (winningNumberVal.trim() !== '') {
        winningNumber = parseInt(winningNumberVal, 10);
    }

    if (winningNumber === null || isNaN(winningNumber) || winningNumber < 0 || winningNumber > 36) {
        alert("Please enter a valid winning number (0-36).");
        return;
    }

    runAllAnalyses(winningNumber);
    ui.renderHistory();

    document.getElementById('winningNumberInput').value = '';

    const prevNum2 = parseInt(lastItem.num2, 10);

    if (!isNaN(prevNum2)) {
        document.getElementById('number1').value = prevNum2;
        document.getElementById('number2').value = winningNumber;
        setTimeout(() => {
            document.getElementById('calculateButton').click();
        }, 50);
    } else {
        console.warn('handleSubmitResult: previous num2 was not a valid number for auto-calculation.', lastItem.num2);
    }
}


export function updateActivePredictionTypes() {
    const newActiveTypes = state.useAdvancedCalculations 
        ? config.allPredictionTypes 
        : config.allPredictionTypes.filter(type => type.id.startsWith('diff'));
    state.setActivePredictionTypes(newActiveTypes);
    
    ui.updateRouletteLegend();
    
    if (aiWorker) {
        aiWorker.postMessage({ 
            type: 'update_config', 
            payload: { 
                terminalMapping: config.terminalMapping,
                rouletteWheel: config.rouletteWheel
            } 
        });
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
    const simulatedHistory = runSimulationOnHistory(historicalSpinsChronological);
    
    state.setHistory(simulatedHistory);
    state.setConfirmedWinsLog(simulatedHistory.filter(item => item.winningNumber !== null).map(item => item.winningNumber));
    labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));

    historicalAnalysisMessage.textContent = `Successfully processed and simulated ${state.history.length} entries.`;
    await runAllAnalyses();
    ui.renderHistory();
    ui.drawRouletteWheel();
    
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

    if (currentWinningNumbers.length >= 3) {
        const simulatedHistory = runSimulationOnHistory(currentWinningNumbers);
        state.setHistory(simulatedHistory);
        state.setConfirmedWinsLog(simulatedHistory.filter(item => item.winningNumber !== null).map(item => item.winningNumber));
        labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));
    }
    
    await runAllAnalyses();
    ui.renderHistory();

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
