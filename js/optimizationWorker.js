// optimizationWorker.js - Genetic Algorithm for Parameter Optimization

// Corrected import paths for being inside the /js folder
import * as shared from './shared-logic.js';
import * as config from './config.js';

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
    // NEW: Add new strategy config parameters to the parameter space
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
    // NEW: Pocket Distance Prioritization Multipliers
    LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: { min: 1.0, max: 5.0, step: 0.1 },
    HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: { min: 0.1, max: 1.0, step: 0.1 },
    // NEW: Adaptive Influence Forget Factor
    FORGET_FACTOR: { min: 0.9, max: 0.999, step: 0.001 },
    // NEW: Confidence weighting for adaptive influence updates
    CONFIDENCE_WEIGHTING_MULTIPLIER: { min: 0.001, max: 0.1, step: 0.001 },
    CONFIDENCE_WEIGHTING_MIN_THRESHOLD: { min: 0, max: 50, step: 1 },
    // NEW: Primary Factor Shift Detection Parameters
    WARNING_FACTOR_SHIFT_WINDOW_SIZE: { min: 1, max: 20, step: 1 },
    WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: { min: 0.1, max: 1.0, step: 0.05 },
    WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: { min: 0, max: 100, step: 1 }
};
let historyData = [];
let sharedData = {};
let isRunning = false;
let generationCount = 0;

// --- GENETIC ALGORITHM HELPER FUNCTIONS ---

/**
 * Creates a single individual with random parameters within the defined space.
 * @returns {object} An individual with properties for each parameter.
 */
function createIndividual() {
    const individual = {};
    for (const key in parameterSpace) {
        const { min, max, step } = parameterSpace[key];
        const range = (max - min) / step;
        const randomStep = Math.floor(Math.random() * (range + 1));
        individual[key] = min + randomStep * step;
    }
    return individual;
}

/**
 * Performs single-point crossover between two parents to create a child.
 * @param {object} parent1 - The first parent individual.
 * @param {object} parent2 - The second parent individual.
 * @returns {object} A new child individual.
 */
function crossover(parent1, parent2) {
    const child = {};
    const keys = Object.keys(parent1);
    const crossoverPoint = Math.floor(Math.random() * keys.length);

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
 * Mutates an individual's parameters based on the mutation rate.
 * @param {object} individual - The individual to mutate.
 * @returns {object} The mutated individual.
 */
function mutate(individual) {
    const mutatedIndividual = { ...individual };
    for (const key in mutatedIndividual) {
        if (Math.random() < currentGaConfig.mutationRate) {
            const { min, max, step } = parameterSpace[key];
            const range = (max - min) / step;
            const randomStep = Math.floor(Math.random() * (range + 1));
            mutatedIndividual[key] = min + randomStep * step;
        }
    }
    return mutatedIndividual;
}

/**
 * Selects a parent from the population using tournament selection.
 * @param {Array} population - The current population of individuals with fitness scores.
 * @returns {object} The selected parent object { individual, fitness }.
 */
function selectParent(population) {
    const tournamentSize = 3; // A common and effective tournament size
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
        const randomIndex = Math.floor(Math.random() * population.length);
        const randomCompetitor = population[randomIndex];
        if (best === null || randomCompetitor.fitness > best.fitness) {
            best = randomCompetitor;
        }
    }
    return best;
}


// --- FITNESS CALCULATION (SIMULATION) ---
function calculateFitness(individual) {
    // FIX: Add a guard clause to handle cases where a faulty individual is created.
    if (!individual) {
        console.warn("Fitness calculation skipped for an undefined individual. Returning 0 fitness.");
        return 0; // Return the lowest possible fitness to eliminate this individual.
    }

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
        // NEW: Include all new scoring and warning parameters
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
        WARNING_FACTOR_SHIFT_WINDOW_SIZE: individual.WARNING_FACTOR_SHIFT_WINDOW_SIZE, // NEW Factor Shift Parameter
        WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: individual.WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD, // NEW Factor Shift Parameter
        WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: individual.WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT, // NEW Factor Shift Parameter
        // NEW: Pocket Distance Prioritization Multipliers
        LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: individual.LOW_POCKET_DISTANCE_BOOST_MULTIPLIER,
        HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: individual.HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER
    };
    const SIM_ADAPTIVE_LEARNING_RATES = {
        SUCCESS: individual.adaptiveSuccessRate,
        FAILURE: individual.adaptiveFailureRate,
        MIN_INFLUENCE: individual.minAdaptiveInfluence,
        MAX_INFLUENCE: individual.maxAdaptiveInfluence,
        FORGET_FACTOR: individual.FORGET_FACTOR, // NEW: Forget factor for simulation
        CONFIDENCE_WEIGHTING_MULTIPLIER: individual.CONFIDENCE_WEIGHTING_MULTIPLIER, // NEW: Confidence weighting multiplier
        CONFIDENCE_WEIGHTING_MIN_THRESHOLD: individual.CONFIDENCE_WEIGHTING_MIN_THRESHOLD // NEW: Confidence weighting min threshold
    };
    let wins = 0;
    let losses = 0;
    let simulatedHistory = [];
    let tempConfirmedWinsLog = [];
    const localAdaptiveFactorInfluences = {
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    };
    const sortedHistory = [...historyData].sort((a, b) => a.id - b.id);
    
    // Track rolling performance during simulation for table change warnings
    let simRollingPerformance = {
        rollingWinRate: 0,
        consecutiveLosses: 0,
        totalPlaysInWindow: 0
    };

    for (let i = 2; i < sortedHistory.length; i++) { // Start from index 2 to have num1 and num2 available
        if (!isRunning) return 0; // Check isRunning more frequently

        const rawItem = sortedHistory[i]; // The current spin result we are evaluating against
        if (rawItem.winningNumber === null) continue; // Skip if no winning number is available for evaluation

        const num1 = sortedHistory[i - 2].winningNumber; // Get n-2 winning number
        const num2 = sortedHistory[i - 1].winningNumber; // Get n-1 winning number

        // If either num1 or num2 from history is null (e.g. from an unsubmitted calculation), skip this iteration
        if (num1 === null || num2 === null) continue; 

        // Update rolling performance based on the *previous* simulated item's outcome,
        // but only if that previous item was an actual 'Play' recommendation.
        // This makes sure the rolling performance is current *before* calculating recommendation for the current spin.
        if (simulatedHistory.length > 0) {
            if (!isRunning) return 0; // Check isRunning more frequently
            const prevSimItem = simulatedHistory[simulatedHistory.length - 1];
            if (prevSimItem.recommendationDetails && prevSimItem.recommendationDetails.finalScore > 0 && prevSimItem.recommendationDetails.signal !== 'Avoid Play') { // Was an actual 'Play' signal
                simRollingPerformance.totalPlaysInWindow++;
                if (prevSimItem.hitTypes.includes(prevSimItem.recommendedGroupId)) {
                    simRollingPerformance.consecutiveLosses = 0;
                } else {
                    simRollingPerformance.consecutiveLosses++;
                }
                // Recalculate rollingWinRate for the window
                let winsInWindowCalc = 0;
                let playsInWindowCalc = 0;
                const windowStart = Math.max(0, simulatedHistory.length - SIM_STRATEGY_CONFIG.WARNING_ROLLING_WINDOW_SIZE);
                for (let j = simulatedHistory.length - 1; j >= windowStart; j--) {
                     if (!isRunning) return 0; // Check isRunning more frequently
                     const historyItemInWindow = simulatedHistory[j];
                     if (historyItemInWindow.recommendationDetails && historyItemInWindow.recommendationDetails.finalScore > 0 && historyItemInWindow.recommendationDetails.signal !== 'Avoid Play') {
                        playsInWindowCalc++;
                        if (historyItemInWindow.hitTypes.includes(historyItemInWindow.recommendedGroupId)) {
                            winsInWindowCalc++;
                        }
                    }
                }
                simRollingPerformance.rollingWinRate = playsInWindowCalc > 0 ? (winsInWindowCalc / playsInWindowCalc) * 100 : 0;
            }
        }

        // --- Apply forget factor to adaptive influences BEFORE calculating recommendation for current spin ---
        for (const factorName in localAdaptiveFactorInfluences) {
            if (!isRunning) return 0; // Check isRunning more frequently
            localAdaptiveFactorInfluences[factorName] = Math.max(SIM_ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, localAdaptiveFactorInfluences[factorName] * SIM_ADAPTIVE_LEARNING_RATES.FORGET_FACTOR);
        }

        // Calculate factor shift status for simulation
        const simFactorShiftStatus = shared.analyzeFactorShift(simulatedHistory, SIM_STRATEGY_CONFIG); // NEW: Get factor shift status for simulation

        const trendStats = shared.calculateTrendStats(simulatedHistory, SIM_STRATEGY_CONFIG, config.allPredictionTypes, config.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
        const boardStats = shared.getBoardStateStats(simulatedHistory, SIM_STRATEGY_CONFIG, config.allPredictionTypes, config.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
        const neighbourScores = shared.runNeighbourAnalysis(simulatedHistory, SIM_STRATEGY_CONFIG, sharedData.toggles.useDynamicTerminalNeighbourCount, config.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
        
        const recommendation = shared.getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: num1, inputNum2: num2,
            isForWeightUpdate: false, aiPredictionData: null, currentAdaptiveInfluences: localAdaptiveFactorInfluences,
            lastWinningNumber: tempConfirmedWinsLog.length > 0 ? tempConfirmedWinsLog[tempConfirmedWinsLog.length - 1] : null,
            useProximityBoostBool: sharedData.toggles.useProximityBoost, useWeightedZoneBool: sharedData.toggles.useWeightedZone,
            useNeighbourFocusBool: sharedData.toggles.useNeighbourFocus, isAiReadyBool: false,
            useTrendConfirmationBool: sharedData.toggles.useTrendConfirmation, 
            useAdaptivePlayBool: sharedData.toggles.useAdaptivePlay, 
            useLessStrictBool: sharedData.toggles.useLessStrict,
            useTableChangeWarningsBool: sharedData.toggles.useTableChangeWarnings, // Pass toggle to recommendation
            rollingPerformance: simRollingPerformance, // Pass current rolling performance to recommendation
            factorShiftStatus: simFactorShiftStatus, // NEW: Pass factor shift status to recommendation
            useLowestPocketDistanceBool: sharedData.toggles.useLowestPocketDistance, // Pass toggle
            current_STRATEGY_CONFIG: SIM_STRATEGY_CONFIG,
            current_ADAPTIVE_LEARNING_RATES: SIM_ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: simulatedHistory,
            useDynamicTerminalNeighbourCount: sharedData.toggles.useDynamicTerminalNeighbourCount,
            activePredictionTypes: config.allPredictionTypes, allPredictionTypes: config.allPredictionTypes,
            terminalMapping: sharedData.terminalMapping, rouletteWheel: sharedData.rouletteWheel
        });
        
        // Create a copy of the raw item but with prediction and recommendation details
        const simItem = { 
            id: rawItem.id, // Keep original ID for sorting consistency
            num1: rawItem.num1,
            num2: rawItem.num2,
            difference: rawItem.difference,
            winningNumber: rawItem.winningNumber, // This is the actual winning number for simulation
            status: 'pending', // Will be re-evaluated below
            hitTypes: [],
            typeSuccessStatus: {},
            pocketDistance: null,
            recommendedGroupPocketDistance: null,
            recommendedGroupId: recommendation.bestCandidate?.type.id || null,
            recommendationDetails: recommendation.details || null // Store the full recommendation details
        }; 
        
        // Evaluate the simulation item against its actual winning number
        shared.evaluateCalculationStatus(simItem, rawItem.winningNumber, sharedData.toggles.useDynamicTerminalNeighbourCount, config.allPredictionTypes, sharedData.terminalMapping, config.rouletteWheel);
        
        // --- UPDATED WIN/LOSS COUNTING LOGIC FOR OPTIMIZATION ---
        // Only count wins/losses if:
        // 1. A recommendation was explicitly made (simItem.recommendedGroupId exists)
        // 2. The recommendation had a positive final score (simItem.recommendationDetails.finalScore > 0),
        //    indicating it was an explicit "Play" signal, not "Wait for Signal" or "Avoid Play".
        //    AND it was not an "Avoid Play" signal explicitly from table change warnings.
        if (simItem.recommendedGroupId && simItem.recommendationDetails && simItem.recommendationDetails.finalScore > 0 && simItem.recommendationDetails.signal !== 'Avoid Play') {
            if (simItem.hitTypes.includes(simItem.recommendedGroupId)) {
                wins++;
            } else {
                losses++;
            }
        }
        // Special case: if signal was 'Avoid Play', it's neither a win nor a loss for the W/L ratio,
        // but it still contributes to the rolling performance tracking logic.

        // Apply adaptive influence updates based on the *simulated* outcome and recommendation
        if (simItem.recommendedGroupId && simItem.recommendationDetails?.primaryDrivingFactor) {
            if (!isRunning) return 0; // Check isRunning more frequently
            const primaryFactor = simItem.recommendationDetails.primaryDrivingFactor;
            // Calculate influence change magnitude based on finalScore
            const influenceChangeMagnitude = Math.max(0, simItem.recommendationDetails.finalScore - SIM_ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MIN_THRESHOLD) * SIM_ADAPTIVE_LEARNING_RATES.CONFIDENCE_WEIGHTING_MULTIPLIER;
            
            if (localAdaptiveFactorInfluences[primaryFactor] === undefined) localAdaptiveFactorInfluences[primaryFactor] = 1.0;
            // Only update influences if it was an actionable signal (not 'Wait' or 'Avoid')
            if (simItem.recommendationDetails.finalScore > 0 && simItem.recommendationDetails.signal !== 'Avoid Play') {
                if (simItem.hitTypes.includes(simItem.recommendedGroupId)) {
                    localAdaptiveFactorInfluences[primaryFactor] = Math.min(SIM_ADAPTIVE_LEARNING_RATES.MAX_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] + (SIM_ADAPTIVE_LEARNING_RATES.SUCCESS + influenceChangeMagnitude)); // Add confidence-weighted part
                } else {
                    localAdaptiveFactorInfluences[primaryFactor] = Math.max(SIM_ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] - (SIM_ADAPTIVE_LEARNING_RATES.FAILURE + influenceChangeMagnitude)); // Subtract confidence-weighted part
                }
            }
        }
        simulatedHistory.push(simItem);
        if (rawItem.winningNumber !== null) tempConfirmedWinsLog.push(rawItem.winningNumber); // Use rawItem's winningNumber for confirmed log
    }
    
    // Calculate fitness as Win/Loss ratio (handle division by zero)
    if (losses === 0) {
        return wins > 0 ? wins * 10 : 0; // If no losses, give high fitness based on wins
    }
    return wins / losses;
}

// --- MAIN EVOLUTION LOOP ---
async function runEvolution() {
    isRunning = true;
    generationCount = 0;
    let population = [];
    for (let i = 0; i < currentGaConfig.populationSize; i++) {
        population.push({ individual: createIndividual(), fitness: 0 });
    }

    try {
        while (isRunning && generationCount < currentGaConfig.maxGenerations) {
            generationCount++;
            for (const p of population) {
                if (!isRunning) break; // Exit inner loop if stopped
                p.fitness = calculateFitness(p.individual);
            }
            if (!isRunning) break; // Exit outer loop if stopped after fitness calculation

            population.sort((a, b) => b.fitness - a.fitness);
            
            self.postMessage({
                type: 'progress',
                payload: {
                    generation: generationCount,
                    maxGenerations: currentGaConfig.maxGenerations,
                    bestFitness: population[0].fitness.toFixed(3),
                    bestIndividual: population[0].individual,
                    processedCount: generationCount * currentGaConfig.populationSize,
                    populationSize: currentGaConfig.populationSize
                }
            });

            // Introduce a yield point to allow the worker to process messages
            await new Promise(resolve => setTimeout(resolve, 0)); // Yield control for a tiny bit
            if (!isRunning) break; // Check again after yielding

            const newPopulation = [];
            for (let i = 0; i < currentGaConfig.eliteCount; i++) {
                newPopulation.push(population[i]);
            }
            while (newPopulation.length < currentGaConfig.populationSize) {
                if (!isRunning) break; // Exit if stopped during population generation
                const parent1 = selectParent(population);
                const parent2 = selectParent(population);

                if (!parent1 || !parent2) {
                    console.warn("Parent selection failed, skipping child creation for this iteration.");
                    continue;
                }

                let child = (Math.random() < currentGaConfig.crossoverRate) ? crossover(parent1.individual, parent2.individual) : { ...parent1.individual };
                child = mutate(child);
                newPopulation.push({ individual: child, fitness: 0 });
            }
            population = newPopulation;
        }
        if (isRunning) { // Only send complete message if not explicitly stopped
            self.postMessage({
                type: 'complete',
                payload: {
                    generation: generationCount,
                    bestFitness: population[0].fitness.toFixed(3),
                    bestIndividual: population[0].individual,
                    togglesUsed: sharedData.toggles // Include the toggles used for this run
                }
            });
        } else {
            self.postMessage({ type: 'stopped' }); // Explicitly send stopped if loop exited due to isRunning = false
        }
    } catch (error) {
        console.error("Error during evolution:", error);
        self.postMessage({ type: 'error', payload: { message: error.message } });
    } finally {
        isRunning = false;
    }
}

// --- WEB WORKER MESSAGE HANDLER ---
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
            isRunning = false; // Set flag immediately
            // The runEvolution loop will pick this up at its next check and send 'stopped' message.
            break;
    }
};
