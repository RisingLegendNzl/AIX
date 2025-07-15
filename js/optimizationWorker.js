// optimizationWorker.js - Genetic Algorithm for Parameter Optimization

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
    WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: { min: 0, max: 100, step: 1 }
};
let historyData = [];
let sharedData = {};
let isRunning = false;
let generationCount = 0;

// --- GENETIC ALGORITHM HELPER FUNCTIONS ---

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

function selectParent(population) {
    const tournamentSize = 3;
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
    if (!individual) {
        console.warn("Fitness calculation skipped for an undefined individual. Returning 0 fitness.");
        return 0;
    }

    const SIM_STRATEGY_CONFIG = {
        ...individual
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
    
    let wins = 0;
    let losses = 0;
    let simulatedHistory = [];
    let tempConfirmedWinsLog = [];
    const localAdaptiveFactorInfluences = {
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    };
    const sortedHistory = [...historyData].sort((a, b) => a.id - b.id);
    
    let simRollingPerformance = {
        rollingWinRate: 0,
        consecutiveLosses: 0,
        totalPlaysInWindow: 0
    };

    for (let i = 2; i < sortedHistory.length; i++) {
        const rawItem = sortedHistory[i];
        if (!isRunning) return 0;
        if (rawItem.winningNumber === null) continue;

        const num1 = sortedHistory[i - 2].winningNumber;
        const num2 = sortedHistory[i - 1].winningNumber;

        if (num1 === null || num2 === null) continue; 

        if (simulatedHistory.length > 0) {
            const prevSimItem = simulatedHistory[simulatedHistory.length - 1];
            if (prevSimItem.recommendationDetails && prevSimItem.recommendationDetails.finalScore > 0 && prevSimItem.recommendationDetails.signal !== 'Avoid Play') {
                simRollingPerformance.totalPlaysInWindow++;
                if (prevSimItem.hitTypes.includes(prevSimItem.recommendedGroupId)) {
                    simRollingPerformance.consecutiveLosses = 0;
                } else {
                    simRollingPerformance.consecutiveLosses++;
                }
                
                let winsInWindowCalc = 0;
                let playsInWindowCalc = 0;
                const windowStart = Math.max(0, simulatedHistory.length - SIM_STRATEGY_CONFIG.WARNING_ROLLING_WINDOW_SIZE);
                for (let j = simulatedHistory.length - 1; j >= windowStart; j--) {
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

        for (const factorName in localAdaptiveFactorInfluences) {
            localAdaptiveFactorInfluences[factorName] = Math.max(SIM_ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, localAdaptiveFactorInfluences[factorName] * SIM_ADAPTIVE_LEARNING_RATES.FORGET_FACTOR);
        }

        const simFactorShiftStatus = shared.analyzeFactorShift(simulatedHistory, SIM_STRATEGY_CONFIG);

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
            useTableChangeWarningsBool: sharedData.toggles.useTableChangeWarnings,
            rollingPerformance: simRollingPerformance,
            factorShiftStatus: simFactorShiftStatus,
            useLowestPocketDistanceBool: sharedData.toggles.useLowestPocketDistance,
            current_STRATEGY_CONFIG: SIM_STRATEGY_CONFIG,
            current_ADAPTIVE_LEARNING_RATES: SIM_ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: simulatedHistory,
            useDynamicTerminalNeighbourCount: sharedData.toggles.useDynamicTerminalNeighbourCount,
            activePredictionTypes: config.allPredictionTypes, allPredictionTypes: config.allPredictionTypes,
            terminalMapping: sharedData.terminalMapping, rouletteWheel: sharedData.rouletteWheel
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
        
        shared.evaluateCalculationStatus(simItem, rawItem.winningNumber, sharedData.toggles.useDynamicTerminalNeighbourCount, config.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
        
        if (simItem.recommendedGroupId && simItem.recommendationDetails && simItem.recommendationDetails.finalScore > 0 && simItem.recommendationDetails.signal !== 'Avoid Play') {
            if (simItem.hitTypes.includes(simItem.recommendedGroupId)) {
                wins++;
            } else {
                losses++;
            }
        }

        if (simItem.recommendedGroupId && simItem.recommendationDetails?.primaryDrivingFactor) {
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
    
    if (losses === 0) {
        return wins > 0 ? wins * 10 : 0;
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
                if (!isRunning) return;
                p.fitness = calculateFitness(p.individual);
            }
            if (!isRunning) return;
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
            const newPopulation = [];
            for (let i = 0; i < currentGaConfig.eliteCount; i++) {
                newPopulation.push(population[i]);
            }
            while (newPopulation.length < currentGaConfig.populationSize) {
                if (!isRunning) return;
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
        if (isRunning) {
            self.postMessage({
                type: 'complete',
                payload: {
                    generation: generationCount,
                    bestFitness: population[0].fitness.toFixed(3),
                    bestIndividual: population[0].individual,
                    togglesUsed: sharedData.toggles
                }
            });
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
            isRunning = false;
            self.postMessage({ type: 'stopped' }); 
            break;
    }
};
