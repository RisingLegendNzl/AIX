// js/analysis.js

// --- IMPORTS ---
import { 
    calculateTrendStats, 
    getBoardStateStats, 
    runNeighbourAnalysis as runSharedNeighbourAnalysis, 
    getRecommendation, 
    evaluateCalculationStatus,
    analyzeFactorShift 
} from './shared-logic.js';
import * as config from './config.js';
import * as state from './state.js';
import * as ui from './ui.js';
import { aiWorker, trendWorker } from './workers.js';
import { calculatePocketDistance } from './shared-logic.js';

// --- ANALYSIS FUNCTIONS ---

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
        if (item.status === 'pending' || item.winningNumber === null) {
            item.failureMode = 'pending';
            return;
        }

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

function determineSystemMode(context) {
    const { rollingPerformance, trendWorkerAnalysis, aiPredictionData } = context;
    const { CONDUCTOR_CONFIG } = config;

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

    if (trendWorkerAnalysis && trendWorkerAnalysis.confidence === CONDUCTOR_CONFIG.AGGRESSIVE_TREND_CONFIDENCE) {
        if (aiPredictionData && aiPredictionData.failures) {
            const criticalFailureProb = (aiPredictionData.failures.streakBreak || 0) + (aiPredictionData.failures.sectionShift || 0);
            if (criticalFailureProb < CONDUCTOR_CONFIG.AGGRESSIVE_AI_FAILURE_PROB_THRESHOLD) {
                return 'aggressive';
            }
        } else if (!aiPredictionData) {
            return 'aggressive';
        }
    }
    
    return 'standard';
}

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

export function triggerTrendAnalysis() {
    if (trendWorker && state.history.length > 0) {
        if (config.DEBUG_MODE) console.log('Triggering Trend Analysis Worker...');
        trendWorker.postMessage({
            type: 'analyze',
            payload: {
                history: state.history
            }
        });
    }
}

export async function runAllAnalyses(winningNumber = null) {
    for (const factorName in state.adaptiveFactorInfluences) {
        state.adaptiveFactorInfluences[factorName] = Math.max(config.ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, state.adaptiveFactorInfluences[factorName] * config.ADAPTIVE_LEARNING_RATES.FORGET_FACTOR);
    }
    state.saveState();

    const trendStats = calculateTrendStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const boardStats = getBoardStateStats(state.history, config.STRATEGY_CONFIG, state.activePredictionTypes, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const neighbourScores = runSharedNeighbourAnalysis(state.history, config.STRATEGY_CONFIG, state.useDynamicTerminalNeighbourCount, config.allPredictionTypes, config.terminalMapping, config.rouletteWheel);
    const rollingPerformance = calculateRollingPerformance(state.history, config.STRATEGY_CONFIG); 
    const factorShiftStatus = analyzeFactorShift(state.history, config.STRATEGY_CONFIG);
    
    const aiPredictionData = await getAiPrediction(state.history); 
    
    const systemMode = determineSystemMode({
        rollingPerformance,
        trendWorkerAnalysis: state.trendWorkerAnalysis,
        aiPredictionData
    });
    state.setSystemMode(systemMode);

    ui.renderAnalysisList(neighbourScores);
    ui.renderStrategyWeights();
    ui.renderBoardState(boardStats);
    ui.renderSystemMode(systemMode);

    const num1Val = parseInt(document.getElementById('number1').value, 10);
    const num2Val = parseInt(document.getElementById('number2').value, 10);

    if (!isNaN(num1Val) && !isNaN(num2Val)) {
        ui.updateAiStatus(state.isAiReady ? 'AI Model: Ready!' : `AI Model: Need ${config.AI_CONFIG.trainingMinHistory} confirmed spins to train.`);
        const lastWinning = state.confirmedWinsLog.length > 0 ? state.confirmedWinsLog[state.confirmedWinsLog.length - 1] : null;
        
        const recommendation = getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: num1Val, inputNum2: num2Val,
            isForWeightUpdate: false, 
            aiPredictionData, 
            systemMode,
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
            current_STRATEGY_CONFIG: config.STRATEGY_CONFIG, 
            current_CONDUCTOR_CONFIG: config.CONDUCTOR_CONFIG,
            current_ADAPTIVE_LEARNING_RATES: config.ADAPTIVE_LEARNING_RATES,
            activePredictionTypes: state.activePredictionTypes,
            currentHistoryForTrend: state.history, useDynamicTerminalNeighbourCount: state.useDynamicTerminalNeighbourCount,
            allPredictionTypes: config.allPredictionTypes, terminalMapping: config.terminalMapping, rouletteWheel: config.rouletteWheel
        });

        const lastPendingItem = [...state.history].reverse().find(item => item.status === 'pending');
        if (lastPendingItem) {
            lastPendingItem.recommendedGroupId = recommendation.bestCandidate?.type.id || null;
            lastPendingItem.recommendationDetails = { 
                ...recommendation.details, 
                signal: recommendation.signal, 
                reason: recommendation.reason 
            }; 

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

// ... other functions like updateActivePredictionTypes, etc. are unchanged ...
