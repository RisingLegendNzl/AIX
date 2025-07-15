// js/analysis.js

// --- IMPORTS ---
import { calculateTrendStats, getBoardStateStats, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import { aiWorker, rlWorker } from './workers.js'; // ADDED rlWorker
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
    // Iterate in chronological order to correctly determine streak breaks and section shifts
    const chronologicalHistory = [...sortedHistory].sort((a, b) => a.id - b.id);

    chronologicalHistory.forEach((item, index) => {
        if (item.status === 'pending' || item.winningNumber === null) {
            item.failureMode = 'pending_or_unresolved'; // Cannot determine failure mode yet
            return;
        }

        // Determine if it was an actionable "Play" signal or an "Avoid Play" signal
        const wasActionablePlay = item.recommendedGroupId && item.recommendationDetails?.finalScore > 0 && item.recommendationDetails?.signal !== 'Avoid Play';

        if (item.status === 'success' && wasActionablePlay) {
            item.failureMode = 'none'; // No failure, it was a hit
            if (item.recommendedGroupId) {
                lastSuccessfulType = item.recommendedGroupId;
            }
            return;
        }
        
        // If it was an 'Avoid Play' signal, label it correctly.
        if (item.recommendationDetails?.signal === 'Avoid Play') {
            item.failureMode = 'avoided_loss';
            return;
        }

        // If it wasn't an actionable play (e.g., "Wait for Signal")
        if (!wasActionablePlay) {
            item.failureMode = 'no_action_taken';
            return;
        }

        // If we reach here, it means item.status is 'fail' AND it was an actionable 'Play'
        item.failureMode = 'normalLoss'; // Default to normalLoss

        // Detect streakBreak
        if (lastSuccessfulType && item.recommendedGroupId === lastSuccessfulType) {
            item.failureMode = 'streakBreak';
        } 
        
        // Detect nearMiss
        if (item.pocketDistance !== null && item.pocketDistance <= config.STRATEGY_CONFIG.NEAR_MISS_DISTANCE_THRESHOLD) {
            item.failureMode = 'nearMiss';
        }

        // Detect sectionShift: More complex. Requires analyzing if the winning number's characteristics
        // (e.g., parity, color, dozen, column) are consistently different from the recommended group's.
        // For a basic implementation: if the last successful play was from a very different type/group category.
        // This is a placeholder for advanced logic as it requires defining "sections" clearly.
        // For instance, if you define "sections" like 'High', 'Low', 'Red', 'Black', 'Dozens', etc.,
        // you would check if the current winning number is in a section that was not predicted,
        // but was a successful section in the immediate past when your strategy failed.
        // For now, let's keep it simple or expand later.
        // Example (conceptual): if (lastWinningNumberSection && currentWinningNumberSection !== recommendedSection && currentWinningNumberSection === lastWinningNumberSection) item.failureMode = 'sectionShift';

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
        if (item.recommendationDetails.finalScore > 0 && item.recommendationDetails.signal !== 'Avoid Play') {
            playsInWindow++;
            if (item.hitTypes.includes(item.recommendedGroupId)) {
                winsInWindow++;
                consecutiveLosses = 0; // Reset on a win
            } else {
                lossesInWindow++;
                consecutiveLosses++; // Increment consecutive losses
            }
        } else {
            // If it was a 'Wait' or 'Avoid' signal, it doesn't count towards the rolling performance for warnings
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
    if (!factorShiftDetected && diversityScore < (1 - strategyConfig.WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD)) {
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
    // Ensure that simulation uses the effective rates (default or RL-tuned for the simulation context)
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
        const effectiveAdaptiveRates = state.getEffectiveAdaptiveLearningRates(); // Get current rates (default or RL)
        for (const factorName in localAdaptiveFactorInfluences) {
            localAdaptiveFactorInfluences[factorName] = Math.max(effectiveAdaptiveRates.MIN_INFLUENCE, localAdaptiveFactorInfluences[factorName] * effectiveAdaptiveRates.FORGET_FACTOR);
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
            current_ADAPTIVE_LEARNING_RATES: effectiveAdaptiveRates, // Use effective adaptive rates for simulation
            currentHistoryForTrend: localHistory, // Use current adaptive rates config
            activePredictionTypes: state.activePredictionTypes,
            useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount, allPredictionTypes: config.allPredictionTypes,
            terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });

        const newHistoryItem = {
            id: Date.now() + i, num1, num2, difference: Math.abs(num2 - num1), status: 'pending', 
            hitTypes: [], typeSuccessStatus: {}, winningNumber, recommendedGroupId: recommendation.bestCandidate?.type.id || null,
            recommendationDetails: recommendation.bestCandidate?.details || null
        };

        // This must run before labelHistoryFailures so pocketDistance is populated
        evaluateCalculationStatus(newHistoryItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);
        
        // Label failure mode for this simulated item
        // For simulation, we need a simplified way to label the failure as labelHistoryFailures
        // works on the whole chronological history and relies on `lastSuccessfulType` etc.
        // For a full simulation, a more complex tracking of lastSuccessfulType within `runSimulationOnHistory` is needed.
        // For now, let's keep it simple:
        if (newHistoryItem.recommendedGroupId && newHistoryItem.recommendationDetails?.finalScore > 0 && newHistoryItem.recommendationDetails.signal !== 'Avoid Play') {
            if (newHistoryItem.status === 'success') {
                newHistoryItem.failureMode = 'none';
            } else {
                newHistoryItem.failureMode = 'normalLoss'; // Default for simulation
                if (newHistoryItem.pocketDistance !== null && newHistoryItem.pocketDistance <= config.STRATEGY_CONFIG.NEAR_MISS_DISTANCE_THRESHOLD) {
                    newHistoryItem.failureMode = 'nearMiss';
                }
                // Streak break and section shift require proper history context in simulation, so we'll omit for now or simplify.
            }
        } else if (newHistoryItem.recommendationDetails?.signal === 'Avoid Play') {
            newHistoryItem.failureMode = 'avoided_loss';
        } else {
            newHistoryItem.failureMode = 'no_action_taken';
        }


        localHistory.push(newHistoryItem);

        // Apply adaptive influence updates within the simulation
        if (newHistoryItem.recommendedGroupId && newHistoryItem.recommendationDetails?.primaryDrivingFactor && newHistoryItem.failureMode) {
            const primaryFactor = newHistoryItem.recommendationDetails.primaryDrivingFactor;
            const influenceChangeMagnitude = Math.max(0, newHistoryItem.recommendationDetails.finalScore - effectiveAdaptiveRates.CONFIDENCE_WEIGHTING_MIN_THRESHOLD) * effectiveAdaptiveRates.CONFIDENCE_WEIGHTING_MULTIPLIER;
            
            if (localAdaptiveFactorInfluences[primaryFactor] === undefined) localAdaptiveFactorInfluences[primaryFactor] = 1.0;
            if (newHistoryItem.recommendationDetails.finalScore > 0 && newHistoryItem.recommendationDetails.signal !== 'Avoid Play') {
                if (newHistoryItem.status === 'success') { // Hit
                    localAdaptiveFactorInfluences[primaryFactor] = Math.min(effectiveAdaptiveRates.MAX_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] + (effectiveAdaptiveRates.SUCCESS + influenceChangeMagnitude)); // Add confidence-weighted part
                } else { // Miss
                    const failureMultiplier = effectiveAdaptiveRates.FAILURE_MULTIPLIERS[newHistoryItem.failureMode] || 1.0;
                    localAdaptiveFactorInfluences[primaryFactor] = Math.max(effectiveAdaptiveRates.MIN_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] - (effectiveAdaptiveRates.FAILURE * failureMultiplier + influenceChangeMagnitude)); // Subtract confidence-weighted part
                }
            }
        }

        if (winningNumber !== null) {
            localConfirmedWinsLog.push(winningNumber);
        }
    }

    return localHistory;
}

export async function runAllAnalyses(winningNumber = null) {
    // --- Apply forget factor to current adaptive influences BEFORE calculating new recommendation ---
    const effectiveAdaptiveRates = state.getEffectiveAdaptiveLearningRates(); // Get current effective rates
    for (const factorName in state.adaptiveFactorInfluences) {
        state.adaptiveFactorInfluences[factorName] = Math.max(effectiveAdaptiveRates.MIN_INFLUENCE, state.adaptiveFactorInfluences[factorName] * effectiveAdaptiveRates.FORGET_FACTOR);
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

    const num1Val = parseInt(document.getElementById('number1').value, 10);
    const num2Val = parseInt(document.getElementById('number2').value, 10);

    if (!isNaN(num1Val) && !isNaN(num2Val)) {
        // --- Get AI Prediction ---
        ui.updateAiStatus('AI Model: Getting prediction...');
        // NEW: Pass repeat/neighbor data for AI prediction as well
        const aiPredictionData = await getAiPrediction(state.history); 
        ui.updateAiStatus(state.isAiReady ? 'AI Model: Ready!' : `AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);

        const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;
        
        // --- Pass prediction data to the recommendation engine ---
        const recommendation = getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: num1Val, inputNum2: num2Val,
            isForWeightUpdate: false, 
            aiPredictionData, // <-- Pass the awaited data here
            currentAdaptiveInfluences: state.adaptiveFactorInfluences,
            lastWinningNumber: lastWinning, useProximityBoostBool: state.useProximityBoost, useWeightedZoneBool: state.useWeightedZone,
            useNeighbourFocusBool: state.useNeighbourFocus, 
            isAiReadyBool: state.isAiReady, // <-- Pass the readiness state
            useTrendConfirmationBool: state.useTrendConfirmation,
            useAdaptivePlayBool: state.useAdaptivePlay, // Pass adaptive play toggle
            useLessStrictBool: state.useLessStrict,     // Pass less strict toggle
            useTableChangeWarningsBool: state.useTableChangeWarnings, // PASS TABLE CHANGE WARNING TOGGLE
            rollingPerformance: rollingPerformance, // PASS ROLLING PERFORMANCE DATA
            factorShiftStatus: factorShiftStatus, // PASS FACTOR SHIFT STATUS
            useLowestPocketDistanceBool: state.useLowestPocketDistance, // Pass pocket distance toggle
            // NEW: Pass repeat/neighbor hit status to recommendation for potential special handling or display
            isCurrentRepeat: isRepeatNumber(lastWinning, state.history), // Use the exported function
            isCurrentNeighborHit: isNeighborHit(lastWinning, state.history), // Use the exported function
            current_STRATEGY_CONFIG: config.STRATEGY_CONFIG, 
            current_ADAPTIVE_LEARNING_RATES: effectiveAdaptiveRates, // Use the effective rates from state
            activePredictionTypes: state.activePredictionTypes,
            currentHistoryForTrend: state.history, useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
            allPredictionTypes: config.allPredictionTypes, terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });

        const lastPendingItem = [...state.history].reverse().find(item => item.status === 'pending');
        if (lastPendingItem) {
            lastPendingItem.recommendedGroupId = recommendation.bestCandidate?.type.id || null;
            lastPendingItem.recommendationDetails = recommendation.details;
            lastPendingItem.recommendationDetails.signal = recommendation.signal; // Ensure signal is stored
            lastPendingItem.recommendationDetails.reason = recommendation.reason; // Ensure reason is stored

            if (winningNumber !== null) {
                // This must run before labelHistoryFailures so pocketDistance is populated
                evaluateCalculationStatus(lastPendingItem, winningNumber, state.useDynamicTerminalNeighbourCount, state.activePredictionTypes, config.terminalMapping, config.rouletteWheel);

                // Re-label failures across the entire history based on the latest context
                // This must happen BEFORE adaptive learning update for the current spin (if done here)
                labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id)); 
                
                // Apply adaptive influence updates here, after evaluation and labeling
                if (lastPendingItem.recommendedGroupId && lastPendingItem.recommendationDetails?.primaryDrivingFactor && lastPendingItem.failureMode) {
                    const primaryFactor = lastPendingItem.recommendationDetails.primaryDrivingFactor;
                    const finalScore = lastPendingItem.recommendationDetails.finalScore;
                    const influenceChangeMagnitude = Math.max(0, finalScore - effectiveAdaptiveRates.CONFIDENCE_WEIGHTING_MIN_THRESHOLD) * effectiveAdaptiveRates.CONFIDENCE_WEIGHTING_MULTIPLIER;
                    
                    if (state.adaptiveFactorInfluences[primaryFactor] === undefined) state.adaptiveFactorInfluences[primaryFactor] = 1.0;

                    // Only update influences if it was an actionable signal (not 'Wait' or 'Avoid')
                    if (finalScore > 0 && lastPendingItem.recommendationDetails.signal !== 'Avoid Play') {
                        if (lastPendingItem.status === 'success') { // It was a hit
                            state.adaptiveFactorInfluences[primaryFactor] = Math.min(effectiveAdaptiveRates.MAX_INFLUENCE, state.adaptiveFactorInfluences[primaryFactor] + (effectiveAdaptiveRates.SUCCESS + influenceChangeMagnitude));
                        } else if (lastPendingItem.status === 'fail') { // It was a miss
                            const failureMultiplier = effectiveAdaptiveRates.FAILURE_MULTIPLIERS[lastPendingItem.failureMode] || 1.0;
                            state.adaptiveFactorInfluences[primaryFactor] = Math.max(effectiveAdaptiveRates.MIN_INFLUENCE, state.adaptiveFactorInfluences[primaryFactor] - (effectiveAdaptiveRates.FAILURE * failureMultiplier + influenceChangeMagnitude));
                        }
                    }
                }

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
    labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id)); // Label failures after full simulation

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

    // NEW: Initialize RL worker with historical data if enabled
    if (config.RL_CONFIG.enabled && rlWorker) {
        rlWorker.postMessage({
            type: 'init', // Re-initialize with potentially new history data
            payload: {
                config: config.RL_CONFIG,
                currentAdaptiveRates: state.getEffectiveAdaptiveLearningRates(),
                history: state.history // Send entire history for initial state representation
            }
        });
        ui.updateRlStatus('RL Model: Initialized with historical data.');
    }
}

export async function handleStrategyChange() {
    const currentWinningNumbers = state.history.filter(item => item.winningNumber !== null).map(item => item.winningNumber);

    if (currentWinningNumbers.length >= 3) {
        const simulatedHistory = runSimulationOnHistory(currentWinningNumbers);
        state.setHistory(simulatedHistory);
        state.setConfirmedWinsLog(simulatedHistory.filter(item => item.winningNumber !== null).map(item => item.winningNumber));
        labelHistoryFailures(state.history.slice().sort((a, b) => a.id - b.id)); // Label failures after full simulation
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
