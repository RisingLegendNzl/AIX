// optimizationWorker.js - Genetic Algorithm for Parameter Optimization
// IMPROVED: Wilson score, non-overlapping windows, enhanced fitness calculation

// Corrected import paths for being inside the /js folder
import * as shared from './shared-logic.js';
import * as config from './config.js';

// ===========================
// SEEDED PRNG FOR DETERMINISM
// ===========================

/**
 * Mulberry32 seeded PRNG - deterministic and high quality
 * Returns a function that generates random numbers in [0, 1)
 */
function mulberry32(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Global seeded RNG - will be initialized when optimization starts
let seededRandom = null;

/**
 * Deterministic random number generator
 * Falls back to Math.random if not seeded (shouldn't happen during optimization)
 */
function random() {
    if (seededRandom) {
        return seededRandom();
    }
    console.warn('Unseeded random call - this should not happen during optimization');
    return Math.random();
}

// ===========================
// PARAMETER SPACE DEFINITION
// ===========================

let currentGaConfig = {};
const parameterSpace = {
    learningRate_success: { min: 0.01, max: 1.0, step: 0.01 },
    learningRate_failure: { min: 0.01, max: 0.5, step: 0.01 },
    maxWeight: { min: 1.0, max: 10.0, step: 0.1 },
    minWeight: { min: 0.0, max: 1.0, step: 0.01 },
    decayFactor: { min: 0.7, max: 0.99, step: 0.01 },
    patternMinAttempts: { min: 1, max: 20, step: 1 },
    patternSuccessThreshold: { min: 50, max: 100, step: 1 },
    triggerMinAttempts: { min: 1, max: 20, step: 1 },
    triggerSuccessThreshold: { min: 50, max: 100, step: 1 },
    adaptiveSuccessRate: { min: 0.01, max: 0.5, step: 0.01 },
    adaptiveFailureRate: { min: 0.01, max: 0.5, step: 0.01 },
    minAdaptiveInfluence: { min: 0.0, max: 1.0, step: 0.01 },
    maxAdaptiveInfluence: { min: 1.0, max: 5.0, step: 0.1 },
    hitRateThreshold: { min: 0, max: 100, step: 1 },
    hitRateMultiplier: { min: 0.1, max: 5.0, step: 0.1 },
    maxStreakPoints: { min: 1, max: 50, step: 1 },
    streakMultiplier: { min: 0.1, max: 10.0, step: 0.1 },
    proximityMaxDistance: { min: 1, max: 10, step: 1 },
    proximityMultiplier: { min: 0.1, max: 5.0, step: 0.1 },
    maxNeighbourPoints: { min: 1, max: 50, step: 1 },
    neighbourMultiplier: { min: 0.1, max: 5.0, step: 0.1 },
    aiConfidenceMultiplier: { min: 1, max: 100, step: 1 },
    minAiPointsForReason: { min: 0, max: 20, step: 1 },
    ADAPTIVE_STRONG_PLAY_THRESHOLD: { min: 0, max: 100, step: 1 },
    ADAPTIVE_PLAY_THRESHOLD: { min: 0, max: 100, step: 1 },
    LESS_STRICT_STRONG_PLAY_THRESHOLD: { min: 0, max: 100, step: 1 },
    LESS_STRICT_PLAY_THRESHOLD: { min: 0, max: 100, step: 1 },
    LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: { min: 0, max: 100, step: 1 },
    LESS_STRICT_MIN_STREAK: { min: 1, max: 10, step: 1 },
    SIMPLE_PLAY_THRESHOLD: { min: 0, max: 100, step: 1 },
    MIN_TREND_HISTORY_FOR_CONFIRMATION: { min: 1, max: 10, step: 1 },
    WARNING_ROLLING_WINDOW_SIZE: { min: 5, max: 50, step: 1 },
    WARNING_MIN_PLAYS_FOR_EVAL: { min: 1, max: 20, step: 1 },
    WARNING_LOSS_STREAK_THRESHOLD: { min: 1, max: 10, step: 1 },
    WARNING_ROLLING_WIN_RATE_THRESHOLD: { min: 0, max: 100, step: 1 },
    DEFAULT_AVERAGE_WIN_RATE: { min: 0, max: 100, step: 1 },
    LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: { min: 1.0, max: 5.0, step: 0.1 },
    HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: { min: 0.1, max: 1.0, step: 0.1 },
    FORGET_FACTOR: { min: 0.9, max: 0.999, step: 0.001 },
    CONFIDENCE_WEIGHTING_MULTIPLIER: { min: 0.001, max: 0.1, step: 0.001 },
    CONFIDENCE_WEIGHTING_MIN_THRESHOLD: { min: 0, max: 50, step: 1 },
    WARNING_FACTOR_SHIFT_WINDOW_SIZE: { min: 1, max: 20, step: 1 },
    WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: { min: 0.1, max: 1.0, step: 0.05 },
    WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: { min: 0, max: 100, step: 1 },
    // NEW: Severity bonus parameters
    severityMultiplier: { min: 0.0, max: 10.0, step: 0.5 },
    severityThreshold: { min: 0.3, max: 0.8, step: 0.05 },
    // NEW: AI integration parameters
    aiScoreWeight: { min: 0.0, max: 50.0, step: 1.0 },
    // NEW: Overlap penalty parameters
    overlapPenaltyWeight: { min: 0.0, max: 0.5, step: 0.05 }
};

let historyData = [];
let sharedData = {};
let isRunning = false;
let generationCount = 0;

// Debug tracking
let debugMetrics = {
    perGroupStats: {},
    totalSimulations: 0,
    currentSeed: null,
    wilsonScores: [],
    windowBreakdown: []
};

// ===========================
// GENETIC ALGORITHM FUNCTIONS
// ===========================

/**
 * Creates a single individual with random parameters within the defined space.
 * USES SEEDED RANDOM for determinism
 */
function createIndividual() {
    const individual = {};
    for (const key in parameterSpace) {
        const { min, max, step } = parameterSpace[key];
        const range = (max - min) / step;
        const randomStep = Math.floor(random() * (range + 1));
        individual[key] = min + randomStep * step;
    }
    return individual;
}

/**
 * Performs single-point crossover between two parents.
 * USES SEEDED RANDOM for determinism
 */
function crossover(parent1, parent2) {
    const child = {};
    const keys = Object.keys(parent1);
    const crossoverPoint = Math.floor(random() * keys.length);

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (i < crossoverPoint) {
            child[key] = parent1[key];
        } else {
            child[key] = parent2[key];
        }
    }
    return child;
}

/**
 * Mutates an individual's parameters.
 * USES SEEDED RANDOM for determinism
 */
function mutate(individual) {
    const mutatedIndividual = { ...individual };
    for (const key in mutatedIndividual) {
        if (random() < currentGaConfig.mutationRate) {
            const { min, max, step } = parameterSpace[key];
            const range = (max - min) / step;
            const randomStep = Math.floor(random() * (range + 1));
            mutatedIndividual[key] = min + randomStep * step;
        }
    }
    return mutatedIndividual;
}

/**
 * Tournament selection.
 * USES SEEDED RANDOM for determinism
 */
function selectParent(population) {
    const tournamentSize = 3;
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
        const randomIndex = Math.floor(random() * population.length);
        const randomCompetitor = population[randomIndex];
        if (best === null || randomCompetitor.fitness > best.fitness) {
            best = randomCompetitor;
        }
    }
    return best;
}

// ===========================
// IMPROVED STATISTICAL FUNCTIONS
// ===========================

/**
 * IMPROVED: Wilson score interval lower bound
 * More accurate confidence measure for small sample sizes
 * @param {number} wins - Number of wins
 * @param {number} total - Total number of plays
 * @param {number} z - Z-score for confidence level (default 1.96 for 95%)
 * @returns {number} Lower bound of Wilson score interval
 */
function wilsonLowerBound(wins, total, z = 1.96) {
    if (total === 0) return 0;
    const p = wins / total;
    const denominator = 1 + (z * z) / total;
    const centre = p + (z * z) / (2 * total);
    const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
    return Math.max(0, (centre - spread) / denominator);
}

/**
 * IMPROVED: Stability score using coefficient of variation
 * Better scaling with actual win rate magnitudes
 * @param {number[]} rollingWinRates - Array of rolling win rates
 * @returns {number} Stability score between 0 and 1
 */
function calculateStabilityScore(rollingWinRates) {
    if (rollingWinRates.length < 5) return 1.0;
    const mean = rollingWinRates.reduce((a, b) => a + b, 0) / rollingWinRates.length;
    if (mean === 0) return 0;
    const variance = calculateVariance(rollingWinRates);
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean; // Coefficient of variation
    return 1 / (1 + cv); // Bounded [0, 1]
}

/**
 * Calculate variance of an array
 */
function calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x, y) {
    if (x.length !== y.length || x.length === 0) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    if (denominator === 0) return 0;
    return numerator / denominator;
}

/**
 * NEW: Calculate recency-weighted win rate
 * More recent plays have higher weight
 * @param {boolean[]} results - Array of results (true = win, false = loss), newest last
 * @param {number} halfLife - Number of plays for weight to halve
 * @returns {number} Weighted win rate
 */
function calculateRecencyWeightedWinRate(results, halfLife = 10) {
    if (results.length === 0) return 0;
    
    let weightedWins = 0;
    let totalWeight = 0;
    
    for (let i = 0; i < results.length; i++) {
        const age = results.length - 1 - i;
        const weight = Math.pow(0.5, age / halfLife);
        totalWeight += weight;
        if (results[i]) {
            weightedWins += weight;
        }
    }
    
    return totalWeight > 0 ? weightedWins / totalWeight : 0;
}

/**
 * NEW: Calculate streak consistency score
 * Rewards consistent performance, penalizes high variance in win streaks
 * @param {number[]} streakLengths - Array of consecutive win streak lengths
 * @returns {number} Consistency score between 0 and 1
 */
function calculateStreakConsistency(streakLengths) {
    if (streakLengths.length < 2) return 0.5;
    
    const mean = streakLengths.reduce((a, b) => a + b, 0) / streakLengths.length;
    const variance = calculateVariance(streakLengths);
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    
    // Lower CV = more consistent streaks = higher score
    return 1 / (1 + cv);
}

// ===========================
// ENHANCED FITNESS CALCULATION
// ===========================

/**
 * IMPROVED: Enhanced fitness calculation with Wilson score and non-overlapping windows
 * - Uses Wilson score lower bound instead of simple continuity correction
 * - Uses non-overlapping windows to prevent data leakage
 * - Includes recency weighting
 * - Tracks per-group performance
 */
function calculateFitness(individual) {
    if (!individual) {
        console.warn("Fitness calculation skipped for undefined individual.");
        return 0;
    }

    // Build configuration for this individual
    const SIM_STRATEGY_CONFIG = {
        learningRate_success: individual.learningRate_success,
        learningRate_failure: individual.learningRate_failure,
        maxWeight: individual.maxWeight,
        minWeight: individual.minWeight,
        decayFactor: individual.decayFactor,
        patternMinAttempts: individual.patternMinAttempts,
        patternSuccessThreshold: individual.patternSuccessThreshold,
        triggerMinAttempts: individual.triggerMinAttempts,
        triggerSuccessThreshold: individual.triggerSuccessThreshold,
        hitRateThreshold: individual.hitRateThreshold,
        hitRateMultiplier: individual.hitRateMultiplier,
        maxStreakPoints: individual.maxStreakPoints,
        streakMultiplier: individual.streakMultiplier,
        proximityMaxDistance: individual.proximityMaxDistance,
        proximityMultiplier: individual.proximityMultiplier,
        maxNeighbourPoints: individual.maxNeighbourPoints,
        neighbourMultiplier: individual.neighbourMultiplier,
        aiConfidenceMultiplier: individual.aiConfidenceMultiplier,
        minAiPointsForReason: individual.minAiPointsForReason,
        ADAPTIVE_STRONG_PLAY_THRESHOLD: individual.ADAPTIVE_STRONG_PLAY_THRESHOLD,
        ADAPTIVE_PLAY_THRESHOLD: individual.ADAPTIVE_PLAY_THRESHOLD,
        LESS_STRICT_STRONG_PLAY_THRESHOLD: individual.LESS_STRICT_STRONG_PLAY_THRESHOLD,
        LESS_STRICT_PLAY_THRESHOLD: individual.LESS_STRICT_PLAY_THRESHOLD,
        LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: individual.LESS_STRICT_HIGH_HIT_RATE_THRESHOLD,
        LESS_STRICT_MIN_STREAK: individual.LESS_STRICT_MIN_STREAK,
        SIMPLE_PLAY_THRESHOLD: individual.SIMPLE_PLAY_THRESHOLD,
        MIN_TREND_HISTORY_FOR_CONFIRMATION: individual.MIN_TREND_HISTORY_FOR_CONFIRMATION,
        WARNING_ROLLING_WINDOW_SIZE: individual.WARNING_ROLLING_WINDOW_SIZE,
        WARNING_MIN_PLAYS_FOR_EVAL: individual.WARNING_MIN_PLAYS_FOR_EVAL,
        WARNING_LOSS_STREAK_THRESHOLD: individual.WARNING_LOSS_STREAK_THRESHOLD,
        WARNING_ROLLING_WIN_RATE_THRESHOLD: individual.WARNING_ROLLING_WIN_RATE_THRESHOLD,
        DEFAULT_AVERAGE_WIN_RATE: individual.DEFAULT_AVERAGE_WIN_RATE,
        WARNING_FACTOR_SHIFT_WINDOW_SIZE: individual.WARNING_FACTOR_SHIFT_WINDOW_SIZE,
        WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: individual.WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD,
        WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: individual.WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT,
        LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: individual.LOW_POCKET_DISTANCE_BOOST_MULTIPLIER,
        HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: individual.HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER,
        conditionalProbMultiplier: individual.conditionalProbMultiplier || 10,
        minConditionalSampleSize: individual.minConditionalSampleSize || 5,
        // NEW: Severity and AI parameters
        severityMultiplier: individual.severityMultiplier || 5,
        severityThreshold: individual.severityThreshold || 0.5,
        aiScoreWeight: individual.aiScoreWeight || 10,
        overlapPenaltyWeight: individual.overlapPenaltyWeight || 0.2
    };
    
    const SIM_ADAPTIVE_LEARNING_RATES = {
        SUCCESS: individual.adaptiveSuccessRate,
        FAILURE: individual.adaptiveFailureRate,
        MIN_INFLUENCE: individual.minAdaptiveInfluence,
        MAX_INFLUENCE: individual.maxAdaptiveInfluence,
        FORGET_FACTOR: individual.FORGET_FACTOR,
        CONFIDENCE_WEIGHTING_MULTIPLIER: individual.CONFIDENCE_WEIGHTING_MULTIPLIER,
        CONFIDENCE_WEIGHTING_MIN_THRESHOLD: individual.CONFIDENCE_WEIGHTING_MIN_THRESHOLD
    };

    // IMPROVED: Non-overlapping windows to prevent data leakage
    const historyLength = historyData.length;
    const windowSize = Math.floor(historyLength / 3);
    
    const windows = [
        { start: 0, end: windowSize, name: 'Early', weight: 0.8 },
        { start: windowSize, end: windowSize * 2, name: 'Middle', weight: 1.0 },
        { start: windowSize * 2, end: historyLength, name: 'Recent', weight: 1.2 }
    ];

    let windowFitnesses = [];
    let windowBreakdown = [];
    
    // Initialize per-group tracking
    const groupStats = {};
    config.allPredictionTypes.forEach(type => {
        groupStats[type.id] = { wins: 0, losses: 0, plays: 0, streakLengths: [] };
    });

    for (const window of windows) {
        if (!isRunning) return 0;

        const windowHistory = historyData.slice(window.start, window.end);
        if (windowHistory.length < 5) continue; // Skip if too small

        const sortedHistory = [...windowHistory].sort((a, b) => a.id - b.id);

        let wins = 0;
        let losses = 0;
        let simulatedHistory = [];
        let tempConfirmedWinsLog = [];
        let currentStreak = 0;
        let streakLengths = [];
        
        // Track data for enhanced metrics
        let rollingWinRates = [];
        let recommendationScores = [];
        let actualHits = []; // 1 if hit, 0 if miss
        let resultSequence = []; // true/false for recency weighting
        
        // Track recent failures for overlap penalty
        let recentFailedHitZones = [];
        
        const localAdaptiveFactorInfluences = {
            'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
            'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
        };

        let simRollingPerformance = {
            rollingWinRate: 0,
            consecutiveLosses: 0,
            totalPlaysInWindow: 0
        };

        let recommendationMadeCount = 0;

        for (let i = 2; i < sortedHistory.length; i++) {
            if (!isRunning) return 0;

            const rawItem = sortedHistory[i];
            if (rawItem.winningNumber === null) continue;

            const num1 = sortedHistory[i - 2].winningNumber;
            const num2 = sortedHistory[i - 1].winningNumber;

            if (num1 === null || num2 === null) continue;

            // Update rolling performance
            if (simulatedHistory.length > 0) {
                const rollingWindowCalc = Math.min(SIM_STRATEGY_CONFIG.WARNING_ROLLING_WINDOW_SIZE, simulatedHistory.length);
                const recentForRolling = simulatedHistory.slice(-rollingWindowCalc);
                let winsInWindowCalc = 0;
                let playsInWindowCalc = 0;
                
                for (const simHistItem of recentForRolling) {
                    if (simHistItem.recommendedGroupId && simHistItem.recommendationDetails?.finalScore > 0) {
                        playsInWindowCalc++;
                        if (simHistItem.hitTypes.includes(simHistItem.recommendedGroupId)) {
                            winsInWindowCalc++;
                        }
                    }
                }
                simRollingPerformance.totalPlaysInWindow = playsInWindowCalc;
                simRollingPerformance.rollingWinRate = playsInWindowCalc > 0 ? (winsInWindowCalc / playsInWindowCalc) * 100 : 0;
                
                // Track rolling win rate for variance calculation
                if (playsInWindowCalc >= 3) {
                    rollingWinRates.push(simRollingPerformance.rollingWinRate);
                }
            }

            // IMPROVED: Only apply forget factor when recommendation was made
            if (recommendationMadeCount > 0 && recommendationMadeCount % 5 === 0) {
                for (const factorName in localAdaptiveFactorInfluences) {
                    if (!isRunning) return 0;
                    localAdaptiveFactorInfluences[factorName] = Math.max(
                        SIM_ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, 
                        localAdaptiveFactorInfluences[factorName] * SIM_ADAPTIVE_LEARNING_RATES.FORGET_FACTOR
                    );
                }
            }

            const simFactorShiftStatus = shared.analyzeFactorShift(simulatedHistory, SIM_STRATEGY_CONFIG);
            const trendStats = shared.calculateTrendStats(simulatedHistory, SIM_STRATEGY_CONFIG, config.allPredictionTypes, config.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
            const boardStats = shared.getBoardStateStats(simulatedHistory, SIM_STRATEGY_CONFIG, config.allPredictionTypes, config.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
            const neighbourScores = shared.runNeighbourAnalysis(simulatedHistory, SIM_STRATEGY_CONFIG, sharedData.toggles.useDynamicTerminalNeighbourCount, config.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
            
            const recommendation = shared.getRecommendation({
                trendStats, boardStats, neighbourScores, inputNum1: num1, inputNum2: num2,
                isForWeightUpdate: false, aiPredictionData: null, currentAdaptiveInfluences: localAdaptiveFactorInfluences,
                lastWinningNumber: tempConfirmedWinsLog.length > 0 ? tempConfirmedWinsLog[tempConfirmedWinsLog.length - 1] : null,
                useProximityBoostBool: sharedData.toggles.useProximityBoost, 
                useWeightedZoneBool: sharedData.toggles.useWeightedZone,
                useNeighbourFocusBool: sharedData.toggles.useNeighbourFocus, 
                isAiReadyBool: false,
                useTrendConfirmationBool: sharedData.toggles.useTrendConfirmation, 
                useAdaptivePlayBool: sharedData.toggles.useAdaptivePlay, 
                useLessStrictBool: sharedData.toggles.useLessStrict,
                useTableChangeWarningsBool: sharedData.toggles.useTableChangeWarnings,
                rollingPerformance: simRollingPerformance,
                factorShiftStatus: simFactorShiftStatus,
                useLowestPocketDistanceBool: sharedData.toggles.useLowestPocketDistance,
                current_STRATEGY_CONFIG: SIM_STRATEGY_CONFIG,
                current_ADAPTIVE_LEARNING_RATES: SIM_ADAPTIVE_LEARNING_RATES, 
                currentHistoryForTrend: simulatedHistory,
                useDynamicTerminalNeighbourCount: sharedData.toggles.useDynamicTerminalNeighbourCount,
                activePredictionTypes: config.allPredictionTypes, 
                allPredictionTypes: config.allPredictionTypes,
                terminalMapping: sharedData.terminalMapping, 
                rouletteWheel: sharedData.rouletteWheel,
                // NEW: Pass recent failed zones for overlap penalty
                recentFailedHitZones: recentFailedHitZones.slice(-5)
            });
            
            const simItem = { 
                id: rawItem.id,
                num1: rawItem.num1,
                num2: rawItem.num2,
                difference: rawItem.difference,
                winningNumber: rawItem.winningNumber,
                status: 'pending',
                hitTypes: [],
                typeSuccessStatus: {},
                pocketDistance: null,
                recommendedGroupPocketDistance: null,
                recommendedGroupId: recommendation.bestCandidate?.type.id || null,
                recommendationDetails: recommendation.details || null
            }; 
            
            shared.evaluateCalculationStatus(simItem, rawItem.winningNumber, sharedData.toggles.useDynamicTerminalNeighbourCount, config.allPredictionTypes, sharedData.terminalMapping, config.rouletteWheel);
            
            // Track metrics for composite fitness
            if (simItem.recommendedGroupId && simItem.recommendationDetails && simItem.recommendationDetails.finalScore > 0 && simItem.recommendationDetails.signal !== 'Avoid Play') {
                const isHit = simItem.hitTypes.includes(simItem.recommendedGroupId);
                
                recommendationScores.push(simItem.recommendationDetails.finalScore);
                actualHits.push(isHit ? 1 : 0);
                resultSequence.push(isHit);
                recommendationMadeCount++;
                
                // Track per-group stats
                if (groupStats[simItem.recommendedGroupId]) {
                    groupStats[simItem.recommendedGroupId].plays++;
                    if (isHit) {
                        groupStats[simItem.recommendedGroupId].wins++;
                        wins++;
                        currentStreak++;
                    } else {
                        groupStats[simItem.recommendedGroupId].losses++;
                        losses++;
                        if (currentStreak > 0) {
                            streakLengths.push(currentStreak);
                            groupStats[simItem.recommendedGroupId].streakLengths.push(currentStreak);
                        }
                        currentStreak = 0;
                        
                        // Track failed hit zone for overlap penalty
                        if (simItem.recommendationDetails.hitZone) {
                            recentFailedHitZones.push(simItem.recommendationDetails.hitZone);
                        }
                    }
                }
            }

            // Apply adaptive influence updates
            if (simItem.recommendedGroupId && simItem.recommendationDetails?.primaryDrivingFactor) {
                if (!isRunning) return 0;
                const primaryFactor = simItem.recommendationDetails.primaryDrivingFactor;
                const influenceChangeMagnitude = Math.max(0, simItem.recommendationDetails.finalScore - SIM_ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MIN_THRESHOLD) * SIM_ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MULTIPLIER;
                
                if (localAdaptiveFactorInfluences[primaryFactor] === undefined) localAdaptiveFactorInfluences[primaryFactor] = 1.0;
                if (simItem.recommendationDetails.finalScore > 0 && simItem.recommendationDetails.signal !== 'Avoid Play') {
                    if (simItem.hitTypes.includes(simItem.recommendedGroupId)) {
                        localAdaptiveFactorInfluences[primaryFactor] = Math.min(SIM_ADAPTIVE_LEARNING_RATES.MAX_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] + (SIM_ADAPTIVE_LEARNING_RATES.SUCCESS + influenceChangeMagnitude));
                    } else {
                        localAdaptiveFactorInfluences[primaryFactor] = Math.max(SIM_ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] - (SIM_ADAPTIVE_LEARNING_RATES.FAILURE + influenceChangeMagnitude));
                    }
                }
            }
            
            simulatedHistory.push(simItem);
            if (rawItem.winningNumber !== null) tempConfirmedWinsLog.push(rawItem.winningNumber);
        }

        // Capture final streak if any
        if (currentStreak > 0) {
            streakLengths.push(currentStreak);
        }

        // ===========================
        // IMPROVED: Calculate composite fitness for this window
        // ===========================

        if (wins === 0 && losses === 0) {
            windowFitnesses.push(0);
            windowBreakdown.push({ name: window.name, fitness: 0, reason: 'No plays' });
            continue;
        }

        const totalPlays = wins + losses;

        // 1. IMPROVED: Wilson score lower bound (replaces continuity correction)
        const wilsonScore = wilsonLowerBound(wins, totalPlays);

        // 2. IMPROVED: Stability score using coefficient of variation
        const stabilityScore = calculateStabilityScore(rollingWinRates);

        // 3. Sample size confidence (saturates at 30 plays)
        const sampleSizeConfidence = Math.min(1.0, totalPlays / 30);

        // 4. Score calibration quality (correlation between scores and hits)
        let calibrationQuality = 0.5; // Neutral default
        if (recommendationScores.length >= 10) {
            const correlation = calculateCorrelation(recommendationScores, actualHits);
            calibrationQuality = 0.5 + 0.5 * Math.max(-1, Math.min(1, correlation));
        }

        // 5. NEW: Recency-weighted win rate bonus
        const recencyWinRate = calculateRecencyWeightedWinRate(resultSequence, 10);
        const recencyBonus = recencyWinRate > 0.5 ? 1 + (recencyWinRate - 0.5) * 0.5 : 1;

        // 6. NEW: Streak consistency bonus
        const streakConsistency = calculateStreakConsistency(streakLengths);
        const streakBonus = 1 + streakConsistency * 0.2;

        // 7. Composite fitness with window weight
        const rawWindowFitness = wilsonScore * stabilityScore * sampleSizeConfidence * calibrationQuality * recencyBonus * streakBonus;
        const weightedWindowFitness = rawWindowFitness * window.weight;
        
        windowFitnesses.push(weightedWindowFitness);
        windowBreakdown.push({
            name: window.name,
            fitness: weightedWindowFitness.toFixed(4),
            wilson: wilsonScore.toFixed(4),
            stability: stabilityScore.toFixed(4),
            calibration: calibrationQuality.toFixed(4),
            recency: recencyBonus.toFixed(4),
            streak: streakBonus.toFixed(4),
            wins,
            losses,
            winRate: ((wins / totalPlays) * 100).toFixed(1)
        });
    }

    // Calculate geometric mean of window fitnesses
    if (windowFitnesses.length === 0) return 0;
    
    // Filter out zero values to prevent geometric mean from being zero
    const nonZeroFitnesses = windowFitnesses.filter(f => f > 0);
    if (nonZeroFitnesses.length === 0) return 0;
    
    const geometricMean = Math.pow(
        nonZeroFitnesses.reduce((product, fitness) => product * fitness, 1),
        1 / nonZeroFitnesses.length
    );

    // Update debug metrics
    debugMetrics.perGroupStats = groupStats;
    debugMetrics.totalSimulations++;
    debugMetrics.windowBreakdown = windowBreakdown;
    debugMetrics.wilsonScores.push(geometricMean);

    return geometricMean;
}

// ===========================
// MAIN EVOLUTION LOOP
// ===========================

async function runEvolution() {
    isRunning = true;
    generationCount = 0;
    
    // Initialize seeded PRNG with deterministic seed
    const seed = historyData.length * 12345 + 67890;
    seededRandom = mulberry32(seed);
    debugMetrics.currentSeed = seed;
    
    // Reset debug metrics
    debugMetrics.totalSimulations = 0;
    debugMetrics.perGroupStats = {};
    debugMetrics.wilsonScores = [];
    debugMetrics.windowBreakdown = [];
    config.allPredictionTypes.forEach(type => {
        debugMetrics.perGroupStats[type.id] = { wins: 0, losses: 0, plays: 0, streakLengths: [] };
    });
    
    let population = [];
    for (let i = 0; i < currentGaConfig.populationSize; i++) {
        population.push({ individual: createIndividual(), fitness: 0 });
    }

    try {
        while (isRunning && generationCount < currentGaConfig.maxGenerations) {
            generationCount++;
            for (const p of population) {
                if (!isRunning) break;
                p.fitness = calculateFitness(p.individual);
            }
            if (!isRunning) break;

            population.sort((a, b) => b.fitness - a.fitness);
            
            // Send progress with enhanced debug data
            self.postMessage({
                type: 'progress',
                payload: {
                    generation: generationCount,
                    maxGenerations: currentGaConfig.maxGenerations,
                    bestFitness: population[0].fitness.toFixed(4),
                    bestIndividual: population[0].individual,
                    processedCount: generationCount * currentGaConfig.populationSize,
                    populationSize: currentGaConfig.populationSize,
                    debugMetrics: {
                        perGroupStats: debugMetrics.perGroupStats,
                        totalSimulations: debugMetrics.totalSimulations,
                        currentSeed: debugMetrics.currentSeed,
                        windowBreakdown: debugMetrics.windowBreakdown,
                        avgWilsonScore: debugMetrics.wilsonScores.length > 0 
                            ? (debugMetrics.wilsonScores.reduce((a, b) => a + b, 0) / debugMetrics.wilsonScores.length).toFixed(4)
                            : '0'
                    }
                }
            });

            await new Promise(resolve => setTimeout(resolve, 0));
            if (!isRunning) break;

            const newPopulation = [];
            for (let i = 0; i < currentGaConfig.eliteCount; i++) {
                newPopulation.push(population[i]);
            }
            while (newPopulation.length < currentGaConfig.populationSize) {
                if (!isRunning) break;
                const parent1 = selectParent(population);
                const parent2 = selectParent(population);

                if (!parent1 || !parent2) {
                    console.warn("Parent selection failed, skipping child creation.");
                    continue;
                }

                let child = (random() < currentGaConfig.crossoverRate) ? crossover(parent1.individual, parent2.individual) : { ...parent1.individual };
                child = mutate(child);
                newPopulation.push({ individual: child, fitness: 0 });
            }
            population = newPopulation;
        }
        
        if (isRunning) {
            self.postMessage({
                type: 'complete',
                payload: {
                    generation: generationCount,
                    bestFitness: population[0].fitness.toFixed(4),
                    bestIndividual: population[0].individual,
                    togglesUsed: sharedData.toggles,
                    debugMetrics: {
                        perGroupStats: debugMetrics.perGroupStats,
                        totalSimulations: debugMetrics.totalSimulations,
                        currentSeed: debugMetrics.currentSeed,
                        windowBreakdown: debugMetrics.windowBreakdown,
                        avgWilsonScore: debugMetrics.wilsonScores.length > 0 
                            ? (debugMetrics.wilsonScores.reduce((a, b) => a + b, 0) / debugMetrics.wilsonScores.length).toFixed(4)
                            : '0'
                    }
                }
            });
        } else {
            self.postMessage({ type: 'stopped' });
        }
    } catch (error) {
        console.error("Error during evolution:", error);
        self.postMessage({ type: 'error', payload: { message: error.message } });
    } finally {
        isRunning = false;
        seededRandom = null;
    }
}

// ===========================
// WEB WORKER MESSAGE HANDLER
// ===========================

self.onmessage = (event) => {
    const { type, payload } = event.data;
    switch (type) {
        case 'start':
            if (isRunning) return;
            historyData = payload.history;
            currentGaConfig = payload.GA_CONFIG;
            sharedData = {
                terminalMapping: payload.terminalMapping,
                rouletteWheel: payload.rouletteWheel,
                toggles: payload.toggles
            };
            runEvolution();
            break;
        case 'stop':
            isRunning = false;
            break;
    }
};