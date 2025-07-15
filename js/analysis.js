// js/analysis.js

// --- IMPORTS ---
import { calculateTrendStats, getBoardStateStats, runNeighbourAnalysis as runSharedNeighbourAnalysis, getRecommendation, evaluateCalculationStatus } from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import { aiWorker, trendWorker } from './workers.js';
import { calculatePocketDistance } from './shared-logic.js';

// ... getAiPrediction, labelHistoryFailures, etc. remain the same ...

/**
 * NEW: The "Master Strategy Conductor".
 * Determines the global system mode (aggressive, defensive, standard) based on all available data.
 * @param {object} context - An object containing all necessary analysis data.
 * @returns {string} The determined system mode ('aggressive', 'defensive', 'standard').
 */
function determineSystemMode(context) {
    const { rollingPerformance, trendWorkerAnalysis, aiPredictionData } = context;
    const { CONDUCTOR_CONFIG } = config;

    // --- Defensive Mode Check (Highest Priority) ---
    if (rollingPerformance.consecutiveLosses >= CONDUCTOR_CONFIG.DEFENSIVE_LOSS_STREAK_THRESHOLD) {
        return 'defensive';
    }
    if (rollingPerformance.totalPlaysInWindow >= config.STRATEGY_CONFIG.WARNING_MIN_PLAYS_FOR_EVAL &&
        rollingPerformance.rollingWinRate < CONDUCTOR_CONFIG.DEFENSIVE_WIN_RATE_THRESHOLD) {
        return 'defensive';
    }
    if (aiPredictionData && aiPredictionData.failures) {
        const criticalFailureProb = (aiPredictionData.failures.streakBreak || 0) + (aiPredictionData.failures.sectionShift || 0);
        if (criticalFailureProb > CONDUCTOR_CONFIG.DEFENSIVE_AI_FAILURE_PROB_THRESHOLD) {
            return 'defensive';
        }
    }

    // --- Aggressive Mode Check ---
    if (trendWorkerAnalysis && trendWorkerAnalysis.confidence === CONDUCTOR_CONFIG.AGGRESSIVE_TREND_CONFIDENCE) {
        if (aiPredictionData && aiPredictionData.failures) {
            const criticalFailureProb = (aiPredictionData.failures.streakBreak || 0) + (aiPredictionData.failures.sectionShift || 0);
            if (criticalFailureProb < CONDUCTOR_CONFIG.AGGRESSIVE_AI_FAILURE_PROB_THRESHOLD) {
                return 'aggressive';
            }
        }
    }
    
    // --- Default to Standard Mode ---
    return 'standard';
}


export async function runAllAnalyses(winningNumber = null) {
    // ... (forget factor logic remains the same) ...
    for (const factorName in state.adaptiveFactorInfluences) {
        state.adaptiveFactorInfluences[factorName] = Math.max(config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, state.adaptiveFactorInfluences[factorName] * config.ADAPTIVE_LEARNING_RATES.FORGET_FACTOR);
    }
    state.saveState();

    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const rollingPerformance = calculateRollingPerformance(state.history, config.STRATEGY_CONFIG); 
    const factorShiftStatus = analyzeFactorShift(state.history, config.STRATEGY_CONFIG);
    
    // Get AI prediction data before determining the mode
    const aiPredictionData = await getAiPrediction(state.history); 
    
    // NEW: Determine the system's operational mode using the Conductor
    const systemMode = determineSystemMode({
        rollingPerformance,
        trendWorkerAnalysis: state.trendWorkerAnalysis,
        aiPredictionData
    });
    state.setSystemMode(systemMode); // Update the global state

    // Render all UI components, including the new system status
    ui.renderAnalysisList(neighbourScores);
    ui.renderStrategyWeights();
    ui.renderBoardState(boardStats);
    ui.renderSystemMode(systemMode); // NEW: Render the conductor's status

    const num1Val = parseInt(document.getElementById('number1').value, 10);
    const num2Val = parseInt(document.getElementById('number2').value, 10);

    if (!isNaN(num1Val) && !isNaN(num2Val)) {
        ui.updateAiStatus(state.isAiReady ? 'AI Model: Ready!' : `AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);
        const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;
        
        // Pass all data, including the new systemMode, to the recommendation engine
        const recommendation = getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: num1Val, inputNum2: num2Val,
            isForWeightUpdate: false, 
            aiPredictionData, 
            systemMode, // NEW: Pass the determined system mode
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
            trendWorkerAnalysis: state.trendWorkerAnalysis,
            isCurrentRepeat: isRepeatNumber(lastWinning, state.history),
            isCurrentNeighborHit: isNeighborHit(lastWinning, state.history),
            current_STRATEGY_CONFIG: config.STRATEGY_CONFIG, current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES,
            activePredictionTypes: state.activePredictionTypes,
            currentHistoryForTrend: state.history, useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
            allPredictionTypes: config.allPredictionTypes, terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });

        // ... rest of the function remains the same ...
    }
}
// ... rest of the analysis.js file is unchanged ...
