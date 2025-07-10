// optimizationWorker.js - Genetic Algorithm for Parameter Optimization

// Import the shared logic file. This is MUCH more robust than rebuilding functions from strings.
import * as shared from './shared-logic.js';

// This variable will hold the config passed from the main thread.
let currentGaConfig = {};

// --- PARAMETER DEFINITIONS (The "Genes") ---
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
    maxAdaptiveInfluence: { min: 1.0, max: 5.0, step: 0.1 }
};

let historyData = [];
let sharedData = {}; // To hold data from main thread like rouletteWheel, terminalMapping etc.
let isRunning = false;
let generationCount = 0;

// --- CORE GENETIC ALGORITHM LOGIC (Unchanged) ---
function createIndividual() {
    const individual = {};
    for (const key in parameterSpace) {
        const { min, max, step } = parameterSpace[key];
        const randomStep = Math.floor(Math.random() * (((max - min) / step) + 1));
        individual[key] = parseFloat((min + randomStep * step).toFixed(4));
    }
    return individual;
}

function crossover(parent1, parent2) {
    const child = {};
    for (const key in parent1) {
        child[key] = Math.random() < 0.5 ? parent1[key] : parent2[key];
    }
    return child;
}

function mutate(individual) {
    for (const key in individual) {
        if (Math.random() < currentGaConfig.mutationRate) {
            const { min, max, step } = parameterSpace[key];
            const randomStep = Math.floor(Math.random() * (((max - min) / step) + 1));
            individual[key] = parseFloat((min + randomStep * step).toFixed(4));
        }
    }
    return individual;
}

function selectParent(population) {
    const tournamentSize = 5;
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
        const randomIndividual = population[Math.floor(Math.random() * population.length)];
        if (best === null || randomIndividual.fitness > best.fitness) {
            best = randomIndividual;
        }
    }
    return best;
}

// --- FITNESS CALCULATION (SIMULATION) ---
function calculateFitness(individual) {
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
    };

    const SIM_ADAPTIVE_LEARNING_RATES = {
        SUCCESS: individual.adaptiveSuccessRate,
        FAILURE: individual.adaptiveFailureRate,
        MIN_INFLUENCE: individual.minAdaptiveInfluence,
        MAX_INFLUENCE: individual.maxAdaptiveInfluence,
    };

    let wins = 0;
    let losses = 0;
    let simulatedHistory = [];
    let tempConfirmedWinsLog = []; // Local log for winning numbers in this simulation
    // Adaptive influences for this specific simulation
    const localAdaptiveFactorInfluences = {
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    };

    const sortedHistory = [...historyData].sort((a, b) => a.id - b.id);

    // Iterate through the historical data provided to the worker
    for (const rawItem of sortedHistory) {
        if (!isRunning) return 0; // Stop if optimization is halted
        if (rawItem.winningNumber === null) continue; // Skip items without a winning number

        // Use the imported shared functions directly
        const trendStats = shared.calculateTrendStats(simulatedHistory, SIM_STRATEGY_CONFIG, sharedData.allPredictionTypes, sharedData.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
        const boardStats = shared.getBoardStateStats(simulatedHistory, SIM_STRATEGY_CONFIG, sharedData.allPredictionTypes, sharedData.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
        const neighbourScores = shared.runNeighbourAnalysis(simulatedHistory, SIM_STRATEGY_CONFIG, sharedData.useDynamicTerminalNeighbourCount, sharedData.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);

        // Get recommendation for the current simulated spin
        const recommendation = shared.getRecommendation({
            trendStats,
            boardStats,
            neighbourScores,
            inputNum1: rawItem.num1,
            inputNum2: rawItem.num2,
            isForWeightUpdate: false,
            aiPredictionData: null, // AI not used in GA fitness for now
            currentAdaptiveInfluences: localAdaptiveFactorInfluences, // Use local influences
            lastWinningNumber: tempConfirmedWinsLog.length > 0 ? tempConfirmedWinsLog[tempConfirmedWinsLog.length - 1] : null,
            useProximityBoostBool: sharedData.useProximityBoost, // Use the actual toggle states passed from main
            useWeightedZoneBool: sharedData.useWeightedZone,
            useNeighbourFocusBool: sharedData.useNeighbourFocus,
            isAiReadyBool: false, // AI not used in GA fitness for now
            useTrendConfirmationBool: sharedData.useTrendConfirmation,
            current_STRATEGY_CONFIG: SIM_STRATEGY_CONFIG,
            current_ADAPTIVE_LEARNING_RATES: SIM_ADAPTIVE_LEARNING_RATES,
            currentHistoryForTrend: simulatedHistory, // Pass current simulation history for trend
            useDynamicTerminalNeighbourCount: sharedData.useDynamicTerminalNeighbourCount, // Pass this toggle
            activePredictionTypes: sharedData.allPredictionTypes,
            allPredictionTypes: sharedData.allPredictionTypes, // Pass necessary global data
            terminalMapping: sharedData.terminalMapping,
            rouletteWheel: sharedData.rouletteWheel
        });

        // Create a new simulation item to evaluate (similar to main app's history item)
        const simItem = { ...rawItem }; // Copy original raw item properties
        simItem.recommendedGroupId = recommendation.bestCandidate ? recommendation.bestCandidate.type.id : null;

        // Evaluate the status of this simulated spin using shared logic
        shared.evaluateCalculationStatus(simItem, rawItem.winningNumber, sharedData.useDynamicTerminalNeighbourCount, sharedData.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);

        // Update wins/losses based on the recommendation
        if (simItem.recommendedGroupId && simItem.hitTypes.includes(simItem.recommendedGroupId)) {
            wins++;
        } else if (simItem.recommendedGroupId) { // Count as a loss if a recommendation was made but missed
            losses++;
        }
        
        // Update adaptive influences for this simulation run
        if (simItem.recommendedGroupId && recommendation.bestCandidate?.details?.primaryDrivingFactor) {
            const primaryFactor = recommendation.bestCandidate.details.primaryDrivingFactor;
            if (localAdaptiveFactorInfluences[primaryFactor] === undefined) localAdaptiveFactorInfluences[primaryFactor] = 1.0; // Initialize if not present
            if (simItem.hitTypes.includes(simItem.recommendedGroupId)) {
                localAdaptiveFactorInfluences[primaryFactor] = Math.min(SIM_ADAPTIVE_LEARNING_RATES.MAX_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] + SIM_ADAPTIVE_LEARNING_RATES.SUCCESS);
            } else {
                localAdaptiveFactorInfluences[primaryFactor] = Math.max(SIM_ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] - SIM_ADAPTIVE_LEARNING_RATES.FAILURE);
            }
        }

        simulatedHistory.push(simItem);
        if (simItem.winningNumber !== null) tempConfirmedWinsLog.push(simItem.winningNumber);
    }

    if (losses === 0) return wins > 0 ? wins * 10 : 0; // Avoid division by zero, prioritize wins if no losses
    return wins / losses;
}

// --- MAIN EVOLUTION LOOP (Largely Unchanged) ---
async function runEvolution() {
    isRunning = true;
    generationCount = 0;
    let population = [];
    for (let i = 0; i < currentGaConfig.populationSize; i++) {
        population.push({ individual: createIndividual(), fitness: 0 });
    }

    while (isRunning && generationCount < currentGaConfig.maxGenerations) {
        generationCount++;
        for (const p of population) {
            if (!isRunning) { self.postMessage({ type: 'stopped' }); return; }
            p.fitness = calculateFitness(p.individual);
        }
        if (!isRunning) { self.postMessage({ type: 'stopped' }); return; }

        population.sort((a, b) => b.fitness - a.fitness);
        self.postMessage({
            type: 'progress',
            payload: {
                generation: generationCount,
                maxGenerations: currentGaConfig.maxGenerations,
                bestFitness: population[0].fitness.toFixed(3),
                bestIndividual: population[0].individual,
                processedCount: generationCount * currentGaConfig.populationSize
            }
        });

        const newPopulation = [];
        for (let i = 0; i < currentGaConfig.eliteCount; i++) newPopulation.push(population[i]);
        while (newPopulation.length < currentGaConfig.populationSize) {
            if (!isRunning) { self.postMessage({ type: 'stopped' }); return; }
            const parent1 = selectParent(population);
            const parent2 = selectParent(population);
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
                bestIndividual: population[0].individual
            }
        });
    }
    isRunning = false;
}

// --- WEB WORKER MESSAGE HANDLER ---
self.onmessage = (event) => {
    const { type, payload } = event.data;
    switch (type) {
        case 'start':
            if (isRunning) return;
            historyData = payload.history;
            currentGaConfig = payload.GA_CONFIG; // Receive config from main thread
            // Store the data needed by the shared functions and current toggle states
            sharedData = {
                terminalMapping: payload.terminalMapping,      // Renamed from helpers.terminalMapping
                rouletteWheel: payload.rouletteWheel,          // Renamed from helpers.rouletteWheel
                useDynamicTerminalNeighbourCount: payload.useDynamicTerminalNeighbourCount, // New
                useProximityBoost: payload.useProximityBoost,   // New
                useWeightedZone: payload.useWeightedZone,       // New
                useNeighbourFocus: payload.useNeighbourFocus,   // New
                useTrendConfirmation: payload.useTrendConfirmation, // New
                allPredictionTypes: payload.allPredictionTypes    // NEW: The crucial missing data
            };
            runEvolution();
            break;
        case 'stop':
            isRunning = false;
            break;
    }
};
