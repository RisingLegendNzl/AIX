// analysis.js

// --- IMPORTS ---
import { calculateTrendStats, getBoardStateStats, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import { aiWorker } from './workers.js';
import { calculatePocketDistance } from './shared-logic.js';
import { apiContext } from './api/apiContextManager.js';


// --- ANALYSIS FUNCTIONS ---

/**
 * Asynchronously gets a prediction from the AI worker.
 * NOW RETURNS THE FULL OBJECT INCLUDING aiExplanation
 * @param {Array} history - The current history to send for prediction.
 * @returns {Promise<object|null>} A promise that resolves with the prediction data (including aiExplanation) or null.
 */
export function getAiPrediction(history) {
    if (!state.isAiReady || !aiWorker) {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        const timeout = 1000;

        const timer = setTimeout(() => {
            aiWorker.removeEventListener('message', tempListener);
            console.warn('AI prediction timed out.');
            resolve(null);
        }, timeout);

        const tempListener = (event) => {
            if (event.data.type === 'predictionResult') {
                clearTimeout(timer);
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

/**
 * Calculates rolling performance metrics for table change warnings.
 */
export function calculateRollingPerformance(history, strategyConfig) {
    let winsInWindow = 0;
    let lossesInWindow = 0;
    let playsInWindow = 0;
    let consecutiveLosses = 0;

    const relevantHistory = [...history]
        .filter(item => item.winningNumber !== null && item.recommendationDetails && item.recommendedGroupId)
        .sort((a, b) => b.id - a.id);

    for (let i = 0; i < relevantHistory.length; i++) {
        const item = relevantHistory[i];

        if (item.recommendationDetails.finalScore > 0) {
            playsInWindow++;
            if (item.hitTypes.includes(item.recommendedGroupId)) {
                winsInWindow++;
                consecutiveLosses = 0;
            } else {
                lossesInWindow++;
                consecutiveLosses++;
            }
        }

        if (playsInWindow >= strategyConfig.WARNING_ROLLING_WINDOW_SIZE) {
            break;
        }
    }

    const rollingWinRate = playsInWindow > 0 ? (winsInWindow / playsInWindow) * 100 : 0;

    return {
        rollingWinRate,
        consecutiveLosses,
        totalPlaysInWindow: playsInWindow
    };
}

/**
 * Calculates consecutive hits and misses for each prediction type.
 */
export function calculateConsecutivePerformance(history, allPredictionTypes) {
    const consecutiveHits = {};
    const consecutiveMisses = {};

    allPredictionTypes.forEach(type => {
        consecutiveHits[type.id] = 0;
        consecutiveMisses[type.id] = 0;
    });

    if (history.length === 0) return { consecutiveHits, consecutiveMisses };

    for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        if (item.status === 'pending' || item.winningNumber === null) {
            break; 
        }

        let allTypesEvaluatedForThisItem = false;
        allPredictionTypes.forEach(type => {
            if (item.typeSuccessStatus && item.typeSuccessStatus.hasOwnProperty(type.id)) {
                allTypesEvaluatedForThisItem = true;
                if ((consecutiveHits[type.id] === 0 && consecutiveMisses[type.id] === 0) || 
                    (item.typeSuccessStatus[type.id] && consecutiveHits[type.id] > 0) ||
                    (!item.typeSuccessStatus[type.id] && consecutiveMisses[type.id] > 0)) {
                    
                    if (item.typeSuccessStatus[type.id]) {
                        consecutiveHits[type.id]++; 
                        consecutiveMisses[type.id] = 0;
                    } else {
                        consecutiveMisses[type.id]++; 
                        consecutiveHits[type.id] = 0;
                    }
                } else {
                    consecutiveHits[type.id] = 0;
                    consecutiveMisses[type.id] = 0;
                }
            } else {
                consecutiveHits[type.id] = 0;
                consecutiveMisses[type.id] = 0;
            }
        });
    }

    return { consecutiveHits, consecutiveMisses };
}


/**
 * Analyzes recent successful plays to detect shifts in primary driving factors.
 */
export function analyzeFactorShift(history, strategyConfig) {
    let factorShiftDetected = false;
    let reason = '';

    const relevantSuccessfulPlays = [...history]
        .filter(item => item.status === 'success' && item.winningNumber !== null && item.recommendationDetails && item.recommendationDetails.primaryDrivingFactor !== "N/A")
        .sort((a, b) => b.id - a.id)
        .slice(0, strategyConfig.WARNING_FACTOR_SHIFT_WINDOW_SIZE);

    if (relevantSuccessfulPlays.length < strategyConfig.WARNING_FACTOR_SHIFT_WINDOW_SIZE) {
        return { factorShiftDetected: false, reason: 'Not enough successful plays to detect factor shift.' };
    }

    const factorCounts = {};
    relevantSuccessfulPlays.forEach(item => {
        const factor = item.recommendationDetails.primaryDrivingFactor;
        factorCounts[factor] = (factorCounts[factor] || 0) + 1;
    });

    const totalFactorsConsidered = relevantSuccessfulPlays.length;
    let dominantFactor = null;
    let dominantFactorPercentage = 0;
    let diversityScore = 0;

    Object.keys(factorCounts).forEach(factor => {
        const percentage = (factorCounts[factor] / totalFactorsConsidered) * 100;
        if (percentage > dominantFactorPercentage) {
            dominantFactorPercentage = percentage;
            dominantFactor = factor;
        }
        diversityScore += Math.pow(factorCounts[factor] / totalFactorsConsidered, 2);
    });

    if (dominantFactorPercentage < strategyConfig.WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT) {
        factorShiftDetected = true;
        reason = `No single dominant primary factor (${dominantFactorPercentage.toFixed(1)}%) in recent successful plays.`;
    }

    if (!factorShiftDetected && diversityScore < (1 - strategyConfig.WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD)) {
        factorShiftDetected = true;
        reason = `High diversity of primary factors in recent successful plays.`;
    }

    return { factorShiftDetected, reason: factorShiftDetected ? reason : '' };
}

/**
 * Detects if the winning number is a repeat of a number in the recent history.
 */
export function isRepeatNumber(winningNumber, history, recentHistoryLength = config.AI_CONFIG.sequenceLength) {
    if (history.length === 0) return false;
    const relevantHistory = history
        .filter(item => item.winningNumber !== null)
        .sort((a, b) => b.id - a.id)
        .slice(0, recentHistoryLength);

    return relevantHistory.some(item => item.winningNumber === winningNumber);
}

/**
 * Detects if the winning number is a neighbor of a number in the recent history.
 */
export function isNeighborHit(winningNumber, history, recentHistoryLength = config.AI_CONFIG.sequenceLength, rouletteWheel = config.rouletteWheel, neighborDistance = 1) {
    if (history.length === 0) return false;
    const relevantHistory = history
        .filter(item => item.winningNumber !== null)
        .sort((a, b) => b.id - a.id)
        .slice(0, recentHistoryLength);

    for (const item of relevantHistory) {
        const lastSpin = item.winningNumber;
        if (lastSpin === winningNumber) continue;
        
        const distance = calculatePocketDistance(winningNumber, lastSpin, rouletteWheel);
        if (distance <= neighborDistance) {
            return true;
        }
    }
    return false;
}


function runSimulationOnHistory(spinsToProcess) {
    const localHistory = [];
    let localConfirmedWinsLog = [];
    let localAdaptiveFactorInfluences = {
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    };
    if (spinsToProcess.length < 3) return [];

    let wins = 0;
    let losses = 0;

    for (let i = 2; i < spinsToProcess.length; i++) {
        const num1 = spinsToProcess[i - 2];
        const num2 = spinsToProcess[i - 1];
        const winningNumber = spinsToProcess[i];
        
        for (const factorName in localAdaptiveFactorInfluences) {
            localAdaptiveFactorInfluences[factorName] = Math.max(config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, localAdaptiveFactorInfluences[factorName] * config.ADAPTIVE_LEARNING_RATES.FORGET_FACTOR);
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
                localAdaptiveFactorInfluences[primaryFactor] = Math.min(config.ADAPTIVE_LEARNING_RATES.MAX_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] + (config.ADAPTIVE_LEARNING_RATES.SUCCESS + influenceChangeMagnitude));
            } else {
                localAdaptiveFactorInfluences[primaryFactor] = Math.max(config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] - (config.ADAPTIVE_LEARNING_RATES.FAILURE + influenceChangeMagnitude));
            }
        }

        if (winningNumber !== null) {
            localConfirmedWinsLog.push(winningNumber);
        }
    }

    return localHistory;
}

export async function runAllAnalyses(winningNumber = null) {
    console.log(`ANALYSIS: runAllAnalyses started. Passed winningNumber: ${winningNumber}`);
    
    for (const factorName in state.adaptiveFactorInfluences) {
        state.adaptiveFactorInfluences[factorName] = Math.max(config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, state.adaptiveFactorInfluences[factorName] * config.ADAPTIVE_LEARNING_RATES.FORGET_FACTOR);
    }
    state.saveState();

    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    
    const rollingPerformance = calculateRollingPerformance(state.history, config.STRATEGY_CONFIG); 
    const factorShiftStatus = analyzeFactorShift(state.history, config.STRATEGY_CONFIG);

    ui.renderAnalysisList(neighbourScores);
    ui.renderStrategyWeights();
    ui.renderBoardState(boardStats);
    console.log("ANALYSIS: Analysis panels rendered.");

    const lastPendingItem = [...state.history].reverse().find(item => item.status === 'pending' && item.winningNumber === null);

    if (lastPendingItem) {
        console.log(`ANALYSIS: runAllAnalyses found pending item ID: ${lastPendingItem.id}.`);

        const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;
        const aiPredictionData = await getAiPrediction(state.history); 

        const recommendationForPendingItem = getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: lastPendingItem.num1, inputNum2: lastPendingItem.num2,
            isForWeightUpdate: false, 
            aiPredictionData, 
            currentAdaptiveInfluences: state.adaptiveFactorInfluences,
            lastWinningNumber: lastWinning, useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
            useNeighbourFocusBool: state.useNeighbourFocus, 
            isAiReadyBool: state.isAiReady, 
            useTrendConfirmationBool: state.useTrendConfirmation,
            useAdaptivePlayBool: state.useAdaptivePlay, 
            useLessStrictBool: state.useLessStrict,
            useTableChangeWarningsBool: state.useTableChangeWarnings, 
            rollingPerformance: rollingPerformance, 
            factorShiftStatus: factorShiftStatus, 
            useLowestPocketDistanceBool: state.useLowestPocketDistance, 
            isCurrentRepeat: isRepeatNumber(lastWinning, state.history), 
            isCurrentNeighborHit: isNeighborHit(lastWinning, state.history), 
            current_STRATEGY_CONFIG: config.STRATEGY_CONFIG, current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES,
            activePredictionTypes: state.activePredictionTypes,
            currentHistoryForTrend: state.history, useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
            allPredictionTypes: config.allPredictionTypes, terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });

        const currentPendingStateOfItem = state.history.find(item => item.id === lastPendingItem.id);
        if (currentPendingStateOfItem && currentPendingStateOfItem.status === 'pending' && currentPendingStateOfItem.winningNumber === null) {
            currentPendingStateOfItem.recommendedGroupId = recommendationForPendingItem.bestCandidate?.type.id || null;
            currentPendingStateOfItem.recommendationDetails = { 
                ...recommendationForPendingItem.details, 
                signal: recommendationForPendingItem.signal, 
                reason: recommendationForPendingItem.reason
            };
            console.log(`ANALYSIS: runAllAnalyses successfully updated pending item ID: ${lastPendingItem.id}.`);
        } else {
            console.warn(`ANALYSIS: runAllAnalyses NOT updating pending item ID: ${lastPendingItem.id}.`);
        }
        ui.renderHistory();
    }
    console.log("ANALYSIS: runAllAnalyses finished.");
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

/**
 * NEW: Handles training from stored history (replaces old handleHistoricalAnalysis)
 * Uses confirmedWinsLog from state instead of input fields
 */
export async function handleTrainFromHistory() {
    console.log("handleTrainFromHistory: Function started.");
    
    // Log training start
    ui.addTrainingLogEntry('info', '=== Training Started ===');
    
    // Get confirmed spins from history (these are already stored in chronological order oldest→newest)
    const confirmedSpins = state.confirmedWinsLog;
    const totalHistoryItems = state.history.length;
    const confirmedCount = confirmedSpins.length;
    
    // Log data source info
    const hasApiContext = apiContext.getContextId() !== null;
    const dataSource = hasApiContext ? `History (API: ${apiContext.getContextId()})` : 'History (Manual + API merged)';
    ui.addTrainingLogEntry('data', `Source: ${dataSource}`);
    ui.addTrainingLogEntry('data', `Total history items: ${totalHistoryItems}`);
    ui.addTrainingLogEntry('data', `Confirmed spins available: ${confirmedCount}`);
    
    // Validate we have enough spins
    if (confirmedCount < 3) {
        const errorMsg = `Need at least 3 confirmed spins to train. Current: ${confirmedCount}`;
        ui.addTrainingLogEntry('error', errorMsg);
        ui.updateAiStatus(`AI Model: ${errorMsg}`);
        console.warn("handleTrainFromHistory: Not enough confirmed spins.");
        return;
    }
    
    // Validate all spins are valid roulette numbers
    const invalidSpins = confirmedSpins.filter(n => isNaN(n) || n < 0 || n > 36);
    if (invalidSpins.length > 0) {
        const errorMsg = `Invalid spin values detected: ${invalidSpins.join(', ')}`;
        ui.addTrainingLogEntry('error', errorMsg);
        ui.updateAiStatus(`AI Model: Training failed - invalid data`);
        console.error("handleTrainFromHistory: Invalid spin values:", invalidSpins);
        return;
    }
    
    // Log order verification
    // confirmedWinsLog should already be oldest→newest (sorted by history item id)
    const first5 = confirmedSpins.slice(0, 5);
    const last5 = confirmedSpins.slice(-5).reverse(); // FIXED: Reverse to show newest→oldest
    
    ui.addTrainingLogEntry('data', `First 5 spins (oldest): [${first5.join(', ')}]`);
    ui.addTrainingLogEntry('data', `Last 5 spins (newest): [${last5.join(', ')}]`);
    
    // Order verification against API context if available
    const apiSpins = apiContext.getContextSpins();
    if (apiSpins.length > 0) {
        const apiNewest = apiSpins[0]; // API stores newest first
        const historyNewest = confirmedSpins[confirmedSpins.length - 1];
        
        if (apiNewest === historyNewest) {
            ui.addTrainingLogEntry('success', `Order check: PASS (newest spin matches API: ${historyNewest})`);
        } else {
            ui.addTrainingLogEntry('warning', `Order check: MISMATCH - History newest: ${historyNewest}, API newest: ${apiNewest}`);
        }
    } else {
        ui.addTrainingLogEntry('info', 'Order check: N/A (no API context for comparison)');
    }
    
    ui.addTrainingLogEntry('info', 'Processing and simulating history...');
    ui.updateAiStatus('AI Model: Processing history...');
    
    // Preserve current pending item
    let currentLivePendingItem = null;
    if (state.currentPendingCalculationId) {
        currentLivePendingItem = state.history.find(item => item.id === state.currentPendingCalculationId);
        if (currentLivePendingItem && currentLivePendingItem.status === 'pending' && currentLivePendingItem.winningNumber === null) {
            console.log(`handleTrainFromHistory: Preserving current pending item ID: ${currentLivePendingItem.id}`);
        } else {
            currentLivePendingItem = null;
            state.setCurrentPendingCalculationId(null);
        }
    }

    // The confirmedSpins are already in chronological order (oldest→newest)
    // Run simulation on them
    const simulatedHistory = runSimulationOnHistory(confirmedSpins);
    ui.addTrainingLogEntry('info', `Simulation complete: ${simulatedHistory.length} entries generated`);

    // Re-add preserved pending item
    if (currentLivePendingItem) {
        const newPendingCopy = { ...currentLivePendingItem };
        simulatedHistory.push(newPendingCopy);
        state.setCurrentPendingCalculationId(newPendingCopy.id);
        console.log(`handleTrainFromHistory: Re-added preserved pending item ID: ${newPendingCopy.id}`);
    } else {
        state.setCurrentPendingCalculationId(null);
    }

    state.setHistory(simulatedHistory);
    state.setConfirmedWinsLog(simulatedHistory.filter(item => item.winningNumber !== null).map(item => item.winningNumber));
    labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));

    await runAllAnalyses();
    ui.renderHistory();
    ui.updateMainRecommendationDisplay();
    
    // Check if we have enough for AI training
    const successfulHistoryCount = state.history.filter(item => item.status === 'success').length;
    ui.addTrainingLogEntry('data', `Successful predictions in history: ${successfulHistoryCount}`);
    
    if (successfulHistoryCount >= config.AI_CONFIG.trainingMinHistory) {
        state.setIsAiReady(false);
        ui.updateAiStatus('AI Model: Training...');
        ui.addTrainingLogEntry('info', 'AI training started...');
        
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
        
        // Note: Training completion is handled by aiWorker.onmessage in workers.js
        // We'll add a log entry when the AI status changes to "Ready"
    } else {
        const msg = `Need ${config.AI_CONFIG.trainingMinHistory} successful predictions to train AI. Current: ${successfulHistoryCount}`;
        state.setIsAiReady(false);
        ui.updateAiStatus(`AI Model: ${msg}`);
        ui.addTrainingLogEntry('warning', msg);
    }
    
    ui.addTrainingLogEntry('success', `Analysis complete. Processed ${state.history.length} entries.`);
    console.log("handleTrainFromHistory: Completed.");
}

export async function handleStrategyChange() {
    console.log("handleStrategyChange: Function started.");
    
    for (const factorName in state.adaptiveFactorInfluences) {
        state.adaptiveFactorInfluences[factorName] = Math.max(config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, state.adaptiveFactorInfluences[factorName] * config.ADAPTIVE_LEARNING_RATES.FORGET_FACTOR);
    }
    state.saveState();

    let currentLivePendingItem = null;
    if (state.currentPendingCalculationId) {
        currentLivePendingItem = state.history.find(item => item.id === state.currentPendingCalculationId);
        if (currentLivePendingItem && currentLivePendingItem.status === 'pending' && currentLivePendingItem.winningNumber === null) {
            console.log(`handleStrategyChange: Preserving current pending item ID: ${currentLivePendingItem.id}`);
        } else {
            currentLivePendingItem = null;
            state.setCurrentPendingCalculationId(null);
        }
    }

    const currentWinningNumbers = state.history.filter(item => item.winningNumber !== null).map(item => item.winningNumber);

    let simulatedHistory = [];
    if (currentWinningNumbers.length >= 3) {
        simulatedHistory = runSimulationOnHistory(currentWinningNumbers);
        console.log(`handleStrategyChange: runSimulationOnHistory generated ${simulatedHistory.length} items.`);
    } else {
        console.log("handleStrategyChange: Not enough confirmed winning numbers for re-simulation.");
    }
    
    if (currentLivePendingItem) {
        const newPendingCopy = { ...currentLivePendingItem };
        simulatedHistory.push(newPendingCopy);
        state.setCurrentPendingCalculationId(newPendingCopy.id);
        console.log(`handleStrategyChange: Re-added preserved pending item ID: ${newPendingCopy.id}`);
    } else {
        state.setCurrentPendingCalculationId(null);
    }
    
    state.setHistory(simulatedHistory);
    state.setConfirmedWinsLog(simulatedHistory.filter(item => item.winningNumber !== null).map(item => item.winningNumber));
    labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));
    console.log("handleStrategyChange: History re-simulated and set.");

    await runAllAnalyses();
    ui.updateMainRecommendationDisplay(); 
    console.log("handleStrategyChange: UI updated based on strategy change.");
}

export function trainAiOnLoad() {
    if (!aiWorker || !state.isAiReady) {
        return;
    }

    const successfulHistoryCount = state.history.filter(item => item.status === 'success').length;

    if (successfulHistoryCount < config.AI_CONFIG.trainingMinHistory) {
        state.setIsAiReady(false);
        ui.updateAiStatus(`AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train. (Current: ${successfulHistoryCount})`);
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