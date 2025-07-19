// analysis.js

// --- IMPORTS ---
import { calculateTrendStats, getBoardStateStats, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js'; // Import ui specifically for updateAiStatus, updateMainRecommendationDisplay
import { aiWorker } from './workers.js';
import { calculatePocketDistance } from './shared-logic.js'; // Ensure calculatePocketDistance is imported for local helpers


// --- ANALYSIS FUNCTIONS ---

/**
 * Asynchronously gets a prediction from the AI worker.
 * @param {Array} history - The current history to send for prediction.
 * @returns {Promise<object|null>} A promise that resolves with the prediction data or null.
 */
export function getAiPrediction(history) {
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

/**
 * Calculates rolling performance metrics for table change warnings.
 * @param {Array} history - The full history log.
 * @param {object} strategyConfig - The current strategy configuration.
 * @returns {object} Contains rolling win rate and consecutive losses for plays.
 */
export function calculateRollingPerformance(history, strategyConfig) {
    let winsInWindow = 0;
    let lossesInWindow = 0;
    let playsInWindow = 0;
    let consecutiveLosses = 0; // Consecutive losses for actual "Play" recommendations

    const relevantHistory = [...history]
        .filter(item => item.winningNumber !== null && item.recommendationDetails && item.recommendedGroupId) // Only confirmed plays with recommendations
        .sort((a, b) => b.id - a.id); // From newest to oldest

    for (let i = 0; i < relevantHistory.length; i++) {
        const item = relevantHistory[i];

        // Only count towards rolling window if it was an explicit "Play" signal
        if (item.recommendationDetails.finalScore > 0) {
            playsInWindow++;
            if (item.hitTypes.includes(item.recommendedGroupId)) {
                winsInWindow++;
                consecutiveLosses = 0; // Reset on a win
            } else {
                lossesInWindow++;
                consecutiveLosses++; // Increment consecutive losses
            }
        } else {
            // If it was a 'Wait' signal, it doesn't count towards the rolling performance for warnings
            // Nor does it break the consecutive losses of *plays*
        }

        // Stop once the window size is reached (or end of history)
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
 * @param {Array} history - The full history log.
 * @param {Array} allPredictionTypes - Array of all prediction type definitions.
 * @returns {object} An object with current consecutive hits and misses for each prediction type ID.
 */
export function calculateConsecutivePerformance(history, allPredictionTypes) {
    const consecutiveHits = {};
    const consecutiveMisses = {};

    allPredictionTypes.forEach(type => {
        consecutiveHits[type.id] = 0;
        consecutiveMisses[type.id] = 0;
    });

    if (history.length === 0) return { consecutiveHits, consecutiveMisses };

    // Iterate backwards from the most recent item in the subset
    for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        if (item.status === 'pending' || item.winningNumber === null) {
            // If the item is pending or missing winningNumber, it breaks the streak for all types
            // that were active up to this point, effectively resetting counts.
            // For robust AI features, we might need a more nuanced approach for pending.
            // For now, let's assume only fully evaluated history items contribute to consecutive counts.
            break; 
        }

        let allTypesEvaluatedForThisItem = false;
        allPredictionTypes.forEach(type => {
            if (item.typeSuccessStatus && item.typeSuccessStatus.hasOwnProperty(type.id)) {
                allTypesEvaluatedForThisItem = true; // At least one type was evaluated
                // Only count if not already started, or if continuing same streak
                if ((consecutiveHits[type.id] === 0 && consecutiveMisses[type.id] === 0) || 
                    (item.typeSuccessStatus[type.id] && consecutiveHits[type.id] > 0) ||
                    (!item.typeSuccessStatus[type.id] && consecutiveMisses[type.id] > 0)) {
                    
                    if (item.typeSuccessStatus[type.id]) { // Hit
                        consecutiveHits[type.id]++; 
                        consecutiveMisses[type.id] = 0; // Reset miss streak
                    } else { // Miss
                        consecutiveMisses[type.id]++; 
                        consecutiveHits[type.id] = 0; // Reset hit streak
                    }
                } else {
                    // This means the streak for this specific type was broken by an opposite result earlier in the historySliceForThisItem
                    // So we effectively stop counting for this type beyond this point for this specific snapshot.
                    // This logic ensures we're only capturing the *current* consecutive streak.
                    consecutiveHits[type.id] = 0; // Reset if streak broke earlier
                    consecutiveMisses[type.id] = 0; // Reset if streak broke earlier
                }
            } else {
                // If type success status isn't available for this type in this item,
                // it means this type wasn't active or calculated. Break the streak.
                // Reset for this specific type
                consecutiveHits[type.id] = 0;
                consecutiveMisses[type.id] = 0;
            }
        });
        // If no types were evaluated in this item at all, it's like a break in the chain for all relevant types.
        // This outer break is likely not needed if inner loop handles it for each type.
        // Removing for now for more precise per-type tracking.
        // if (!allTypesEvaluatedForThisItem) {
        //     break;
        // }
    }

    return { consecutiveHits, consecutiveMisses };
}


/**
 * Analyzes recent successful plays to detect shifts in primary driving factors.
 * @param {Array} history - The full history log.
 * @param {object} strategyConfig - The current strategy configuration.
 * @returns {object} Contains boolean for shift detected and a reason.
 */
export function analyzeFactorShift(history, strategyConfig) {
    let factorShiftDetected = false;
    let reason = '';

    const relevantSuccessfulPlays = [...history]
        .filter(item => item.status === 'success' && item.winningNumber !== null && item.recommendationDetails && item.recommendationDetails.primaryDrivingFactor !== "N/A")
        .sort((a, b) => b.id - a.id) // Newest first
        .slice(0, strategyConfig.WARNING_FACTOR_SHIFT_WINDOW_SIZE); // Get only the recent successful plays

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
    let diversityScore = 0; // Higher diversity means more spread out factors

    Object.keys(factorCounts).forEach(factor => {
        const percentage = (factorCounts[factor] / totalFactorsConsidered) * 100;
        if (percentage > dominantFactorPercentage) {
            dominantFactorPercentage = percentage;
            dominantFactor = factor;
        }
        // A simple way to measure diversity: sum of squares of proportions. Lower is more diverse.
        diversityScore += Math.pow(factorCounts[factor] / totalFactorsConsidered, 2);
    });

    // Check for lack of dominance (factors are too spread out)
    if (dominantFactorPercentage < strategyConfig.WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT) {
        factorShiftDetected = true;
        reason = `No single dominant primary factor (${dominantFactorPercentage.toFixed(1)}%) in recent successful plays.`;
    }

    // Check for high diversity (if diversity score is below a threshold, meaning many different factors are hitting)
    // The diversity threshold is usually 1 - (1/N) where N is number of unique factors, but can be a set value.
    // Let's use 1 - WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD for simplicity, if diversityScore is *less* than that, it's diverse.
    if (!factorShiftDetected && diversityScore < (1 - strategyConfig.WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD)) { // Corrected typo here
        factorShiftDetected = true;
        reason = `High diversity of primary factors in recent successful plays.`;
    }
    
    // You could also add logic to compare the *current* dominant factor to the *historical* dominant factor,
    // but that would require storing and comparing historical factor dominance. For now, this focuses on recent diversity/lack of dominance.

    return { factorShiftDetected, reason: factorShiftDetected ? reason : '' };
}

/**
 * Detects if the winning number is a repeat of a number in the recent history (within SEQUENCE_LENGTH).
 * @param {number} winningNumber - The current winning number.
 * @param {Array} history - The current full history.
 * @param {number} recentHistoryLength - How many recent spins to check for repeats.
 * @returns {boolean} True if repeat detected.
 */
export function isRepeatNumber(winningNumber, history, recentHistoryLength = config.AI_CONFIG.sequenceLength) {
    if (history.length === 0) return false;
    const relevantHistory = history
        .filter(item => item.winningNumber !== null) // Only confirmed spins
        .sort((a, b) => b.id - a.id) // Newest first
        .slice(0, recentHistoryLength); // Get only the recent spins

    return relevantHistory.some(item => item.winningNumber === winningNumber);
}

/**
 * Detects if the winning number is a neighbor of a number in the recent history (within SEQUENCE_LENGTH).
 * @param {number} winningNumber - The current winning number.
 * @param {Array} history - The current full history.
 * @param {number} recentHistoryLength - How many recent spins to check for neighbors.
 * @param {Array} rouletteWheel - The ordered roulette wheel array.
 * @param {number} neighborDistance - The maximum distance to consider a neighbor (e.g., 1 or 2).
 * @returns {boolean} True if neighbor hit detected.
 */
export function isNeighborHit(winningNumber, history, recentHistoryLength = config.AI_CONFIG.sequenceLength, rouletteWheel = config.rouletteWheel, neighborDistance = 1) {
    if (history.length === 0) return false;
    const relevantHistory = history
        .filter(item => item.winningNumber !== null) // Only confirmed spins
        .sort((a, b) => b.id - a.id) // Newest first
        .slice(0, recentHistoryLength); // Get only the recent spins

    for (const item of relevantHistory) {
        const lastSpin = item.winningNumber;
        if (lastSpin === winningNumber) continue; // Don't count as neighbor if it's the same number
        
        // Calculate pocket distance between current winning number and the historical spin
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
    let localAdaptiveFactorInfluences = { // Initialized to defaults for simulation
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
        
        // --- Apply forget factor to adaptive influences before current spin's recommendation ---
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
            current_STRATEGY_CONFIG: config.STRATEGY_CONFIG, // Use the current config for simulation
            current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: localHistory, // Use current adaptive rates config
            activePredictionTypes: state.activePredictionTypes,
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount, allPredictionTypes: config.allPredictionTypes,
            terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });

        // IMPORTANT: runSimulationOnHistory should ONLY generate RESOLVED items.
        // It should NOT create or modify pending items from its input stream.
        const newHistoryItem = {
            id: Date.now() + i, // Generate unique ID for this simulated item
            num1,
            num2,
            difference: Math.abs(num2 - num1),
            status: 'resolved', // Always 'resolved' for simulated history
            hitTypes: [],
            typeSuccessStatus: {},
            winningNumber, // This is the resolved winning number
            recommendedGroupId: recommendation.bestCandidate?.type.id || null,
            recommendationDetails: recommendation.bestCandidate?.details || null
        };

        // Evaluate status of this RESOLVED item (based on its own winningNumber)
        evaluateCalculationStatus(newHistoryItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
        localHistory.push(newHistoryItem);

        // Apply adaptive influence updates within the simulation
        if (newHistoryItem.recommendedGroupId && newHistoryItem.recommendationDetails?.primaryDrivingFactor) {
            const primaryFactor = newHistoryItem.recommendationDetails.primaryDrivingFactor;
            // Calculate influence change magnitude based on finalScore
            const influenceChangeMagnitude = Math.max(0, newHistoryItem.recommendationDetails.finalScore - config.ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MIN_THRESHOLD) * config.ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MULTIPLIER;
            
            if (localAdaptiveFactorInfluences[primaryFactor] === undefined) localAdaptiveFactorInfluences[primaryFactor] = 1.0;
            if (newHistoryItem.hitTypes.includes(newHistoryItem.recommendedGroupId)) {
                localAdaptiveFactorInfluences[primaryFactor] = Math.min(config.ADAPTIVE_LEARNING_RATES.MAX_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] + (config.ADAPTIVE_LEARNING_RATES.SUCCESS + influenceChangeMagnitude)); // Add confidence-weighted part
            } else {
                localAdaptiveFactorInfluences[primaryFactor] = Math.max(config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] - (config.ADAPTIVE_LEARNING_RATES.FAILURE + influenceChangeMagnitude)); // Subtract confidence-weighted part
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
    // --- Apply forget factor to current adaptive influences BEFORE calculating new recommendation ---
    for (const factorName in state.adaptiveFactorInfluences) {
        state.adaptiveFactorInfluences[factorName] = Math.max(config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, state.adaptiveFactorInfluences[factorName] * config.ADAPTIVE_LEARNING_RATES.FORGET_FACTOR);
    }
    state.saveState(); // Save state after applying forget factor

    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    
    // Calculate rolling performance for table change warnings
    const rollingPerformance = calculateRollingPerformance(state.history, config.STRATEGY_CONFIG); 

    // NEW: Calculate factor shift status
    const factorShiftStatus = analyzeFactorShift(state.history, config.STRATEGY_CONFIG);

    ui.renderAnalysisList(neighbourScores);
    ui.renderStrategyWeights();
    ui.renderBoardState(boardStats);
    console.log("ANALYSIS: Analysis panels rendered.");


    // This section ensures the `recommendedGroupId` and `recommendationDetails` on any pending history item
    // reflect the *latest* strategy settings after runAllAnalyses is called.
    const lastPendingItem = [...state.history].reverse().find(item => item.status === 'pending' && item.winningNumber === null);

    if (lastPendingItem) {
        console.log(`ANALYSIS: runAllAnalyses found pending item ID: ${lastPendingItem.id}. Its current status: ${lastPendingItem.status}, winningNumber: ${lastPendingItem.winningNumber}`);

        // Get the recommendation for the numbers associated with this pending item
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

        // Defensive check: Ensure the item is STILL pending before updating its recommendation details
        const currentPendingStateOfItem = state.history.find(item => item.id === lastPendingItem.id);
        if (currentPendingStateOfItem && currentPendingStateOfItem.status === 'pending' && currentPendingStateOfItem.winningNumber === null) {
            currentPendingStateOfItem.recommendedGroupId = recommendationForPendingItem.bestCandidate?.type.id || null;
            currentPendingStateOfItem.recommendationDetails = { 
                ...recommendationForPendingItem.details, 
                signal: recommendationForPendingItem.signal, 
                reason: recommendationForPendingItem.reason
            };
            console.log(`ANALYSIS: runAllAnalyses successfully updated pending item ID: ${lastPendingItem.id} with new recommendation details.`);
        } else {
            console.warn(`ANALYSIS: runAllAnalyses NOT updating pending item ID: ${lastPendingItem.id} because its state changed unexpectedly (status: ${currentPendingStateOfItem?.status}, winningNumber: ${currentPendingStateOfItem?.winningNumber}). This might indicate a race condition or incorrect state manipulation elsewhere.`);
        }
        ui.renderHistory(); // Re-render history to reflect updated pending item details
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

export async function handleHistoricalAnalysis() {
    console.log("handleHistoricalAnalysis: Function started.");
    const historicalNumbersInput = document.getElementById('historicalNumbersInput');
    const historicalAnalysisMessage = document.getElementById('historicalAnalysisMessage');
    
    historicalAnalysisMessage.textContent = 'Processing...';
    const numbers = historicalNumbersInput.value.trim().split(/[\s,]+/).filter(Boolean).map(Number);

    if (numbers.length < 3 || numbers.some(n => isNaN(n) || n < 0 || n > 36)) {
        historicalAnalysisMessage.textContent = 'Please provide at least 3 valid numbers (0-36).';
        console.warn("handleHistoricalAnalysis: Invalid historical numbers provided.");
        return;
    }

    // Preserve the current pending item (if any) before rebuilding history
    let currentLivePendingItem = null;
    if (state.currentPendingCalculationId) {
        currentLivePendingItem = state.history.find(item => item.id === state.currentPendingCalculationId);
        if (currentLivePendingItem && currentLivePendingItem.status === 'pending' && currentLivePendingItem.winningNumber === null) {
            console.log(`handleHistoricalAnalysis: Preserving current pending item ID: ${currentLivePendingItem.id}`);
        } else {
            currentLivePendingItem = null; // Don't preserve if it's not truly pending
            state.setCurrentPendingCalculationId(null); // Clear stale ID
            console.warn(`handleHistoricalAnalysis: currentPendingCalculationId (${state.currentPendingCalculationId}) did not point to a valid pending item. Resetting.`);
        }
    }


    const historicalSpinsChronological = numbers.slice().reverse();
    const simulatedHistory = runSimulationOnHistory(historicalSpinsChronological);
    console.log(`handleHistoricalAnalysis: runSimulationOnHistory generated ${simulatedHistory.length} items.`);

    // Add the preserved pending item back to the new history, if it exists
    if (currentLivePendingItem) {
        // Create a shallow copy to ensure we're not adding the exact same object reference if it was already in simulatedHistory (unlikely, but defensive)
        const newPendingCopy = { ...currentLivePendingItem };
        simulatedHistory.push(newPendingCopy);
        state.setCurrentPendingCalculationId(newPendingCopy.id); // Re-set ID to the copy's ID (important if ID was derived from object)
        console.log(`handleHistoricalAnalysis: Re-added preserved pending item ID: ${newPendingCopy.id} to simulated history.`);
    } else {
        state.setCurrentPendingCalculationId(null); // Ensure null if no pending item was preserved
        console.log("handleHistoricalAnalysis: No pending item to re-add to history.");
    }

    state.setHistory(simulatedHistory);
    state.setConfirmedWinsLog(simulatedHistory.filter(item => item.winningNumber !== null).map(item => item.winningNumber));
    labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));


    historicalAnalysisMessage.textContent = `Successfully processed and simulated ${state.history.length} entries.`;
    await runAllAnalyses(); // This will update analysis panels and pending history item details if re-added
    ui.renderHistory();
    // After historical analysis, update the display based on current inputs.
    ui.updateMainRecommendationDisplay(); 
    
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
    console.log("handleHistoricalAnalysis: Historical data analyzed and UI updated.");
}

export async function handleStrategyChange() {
    console.log("handleStrategyChange: Function started.");
    // Apply forget factor before analysis runs
    for (const factorName in state.adaptiveFactorInfluences) {
        state.adaptiveFactorInfluences[factorName] = Math.max(config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, state.adaptiveFactorInfluences[factorName] * config.ADAPTIVE_LEARNING_RATES.FORGET_FACTOR);
    }
    state.saveState();

    // Preserve the current pending item (if any) before rebuilding history
    let currentLivePendingItem = null;
    if (state.currentPendingCalculationId) {
        currentLivePendingItem = state.history.find(item => item.id === state.currentPendingCalculationId);
        if (currentLivePendingItem && currentLivePendingItem.status === 'pending' && currentLivePendingItem.winningNumber === null) {
            console.log(`handleStrategyChange: Preserving current pending item ID: ${currentLivePendingItem.id}`);
        } else {
            currentLivePendingItem = null; // Don't preserve if it's not truly pending
            state.setCurrentPendingCalculationId(null); // Clear stale ID
            console.warn(`handleStrategyChange: currentPendingCalculationId (${state.currentPendingCalculationId}) did not point to a valid pending item. Resetting.`);
        }
    }


    const currentWinningNumbers = state.history.filter(item => item.winningNumber !== null).map(item => item.winningNumber);

    let simulatedHistory = [];
    // Only run simulation if there's enough data and it's meaningful
    if (currentWinningNumbers.length >= 3) {
        simulatedHistory = runSimulationOnHistory(currentWinningNumbers);
        console.log(`handleStrategyChange: runSimulationOnHistory generated ${simulatedHistory.length} items.`);
    } else {
        console.log("handleStrategyChange: Not enough confirmed winning numbers for re-simulation. Using empty simulated history.");
    }
    
    // Add the preserved pending item back to the new history, if it exists
    if (currentLivePendingItem) {
        // Create a shallow copy to ensure we're not adding the exact same object reference if it was already in simulatedHistory (unlikely, but defensive)
        const newPendingCopy = { ...currentLivePendingItem };
        simulatedHistory.push(newPendingCopy);
        state.setCurrentPendingCalculationId(newPendingCopy.id); // Re-set ID to the copy's ID (important if ID was derived from object)
        console.log(`handleStrategyChange: Re-added preserved pending item ID: ${newPendingCopy.id} to simulated history.`);
    } else {
        state.setCurrentPendingCalculationId(null); // Ensure null if no pending item was preserved
        console.log("handleStrategyChange: No pending item to re-add to history.");
    }
    
    state.setHistory(simulatedHistory);
    state.setConfirmedWinsLog(simulatedHistory.filter(item => item.winningNumber !== null).map(item => item.winningNumber));
    labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id));
    console.log("handleStrategyChange: History re-simulated and set.");


    await runAllAnalyses(); // Updates analysis panels and pending history item details if re-added
    // ui.renderHistory(); // renderHistory is called within runAllAnalyses if pending item updated

    // After strategy change and full analysis, update the *current recommendation display*
    // This is the key change: DO NOT create a new history item here, just refresh the display
    ui.updateMainRecommendationDisplay(); 
    console.log("handleStrategyChange: UI updated based on strategy change.");
}

// FIX: Renamed to be more specific. This is for retraining on load.
export function trainAiOnLoad() {
    if (!aiWorker || !state.isAiReady) {
        return;
    }

    const successfulHistoryCount = state.history.filter(item => item.status === 'success').length;

    // FIXED: Corrected the 'else' syntax error by restructuring the if/else logic
    if (successfulHistoryCount < config.AI_CONFIG.trainingMinHistory) {
        state.setIsAiReady(false);
        ui.updateAiStatus(`AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train. (Current: ${successfulHistoryCount})`);
        return;
    }

    // If we reach here, history is sufficient, so proceed with training
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
