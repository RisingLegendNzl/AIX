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
    maxAdaptiveInfluence: { min: 1.0, max: 5.0, step: 0.1 }
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
    let tempConfirmedWinsLog = [];
    const localAdaptiveFactorInfluences = {
        'Hit Rate': 1.0, 'Streak': 1.0, 'Proximity to Last Spin': 1.0,
        'Hot Zone Weighting': 1.0, 'High AI Confidence': 1.0, 'Statistical Trends': 1.0
    };
    const sortedHistory = [...historyData].sort((a, b) => a.id - b.id);
    for (const rawItem of sortedHistory) {
        if (!isRunning) return 0;
        if (rawItem.winningNumber === null) continue;
        const trendStats = shared.calculateTrendStats(simulatedHistory, SIM_STRATEGY_CONFIG, config.allPredictionTypes, config.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
        const boardStats = shared.getBoardStateStats(simulatedHistory, SIM_STRATEGY_CONFIG, config.allPredictionTypes, config.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
        const neighbourScores = shared.runNeighbourAnalysis(simulatedHistory, SIM_STRATEGY_CONFIG, sharedData.useDynamicTerminalNeighbourCount, config.allPredictionTypes, sharedData.terminalMapping, sharedData.rouletteWheel);
        const recommendation = shared.getRecommendation({
            trendStats, boardStats, neighbourScores, inputNum1: rawItem.num1, inputNum2: rawItem.num2,
            isForWeightUpdate: false, aiPredictionData: null, currentAdaptiveInfluences: localAdaptiveFactorInfluences,
            lastWinningNumber: tempConfirmedWinsLog.length > 0 ? tempConfirmedWinsLog[tempConfirmedWinsLog.length - 1] : null,
            useProximityBoostBool: sharedData.toggles.useProximityBoost, useWeightedZoneBool: sharedData.toggles.useWeightedZone,
            useNeighbourFocusBool: sharedData.toggles.useNeighbourFocus, isAiReadyBool: false,
            useTrendConfirmationBool: sharedData.toggles.useTrendConfirmation, current_STRATEGY_CONFIG: SIM_STRATEGY_CONFIG,
            current_ADAPTIVE_LEARNING_RATES: SIM_ADAPTIVE_LEARNING_RATES, currentHistoryForTrend: simulatedHistory,
            useDynamicTerminalNeighbourCount: sharedData.toggles.useDynamicTerminalNeighbourCount,
            activePredictionTypes: config.allPredictionTypes, allPredictionTypes: config.allPredictionTypes,
            terminalMapping: sharedData.terminalMapping, rouletteWheel: sharedData.rouletteWheel
        });
        const simItem = { ...rawItem };
        simItem.recommendedGroupId = recommendation.bestCandidate ? recommendation.bestCandidate.type.id : null;
        simItem.recommendationDetails = recommendation.bestCandidate?.details || null; 
        shared.evaluateCalculationStatus(simItem, rawItem.winningNumber, sharedData.useDynamicTerminalNeighbourCount, config.allPredictionTypes, sharedData.terminalMapping, config.rouletteWheel);
        if (simItem.recommendedGroupId && simItem.hitTypes.includes(simItem.recommendedGroupId)) {
            wins++;
        } else if (simItem.recommendedGroupId) {
            losses++;
        }
        if (simItem.recommendedGroupId && recommendation.bestCandidate?.details?.primaryDrivingFactor) {
            const primaryFactor = recommendation.bestCandidate.details.primaryDrivingFactor;
            if (localAdaptiveFactorInfluences[primaryFactor] === undefined) localAdaptiveFactorInfluences[primaryFactor] = 1.0;
            if (simItem.hitTypes.includes(simItem.recommendedGroupId)) {
                localAdaptiveFactorInfluences[primaryFactor] = Math.min(SIM_ADAPTIVE_LEARNING_RATES.MAX_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] + SIM_ADAPTIVE_LEARNING_RATES.SUCCESS);
            } else {
                localAdaptiveFactorInfluences[primaryFactor] = Math.max(SIM_ADAPTIVE_LEARNING_RATES.MIN_INFLUENCE, localAdaptiveFactorInfluences[primaryFactor] - SIM_ADAPTIVE_LEARNING_RATES.FAILURE);
            }
        }
        simulatedHistory.push(simItem);
        if (simItem.winningNumber !== null) tempConfirmedWinsLog.push(simItem.winningNumber);
    }
    
    // Removed temporary debugging logs for Sim Wins/Losses/Ratio

    if (losses === 0) return wins > 0 ? wins * 10 : 0;
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

    // Removed temporary debugging log for historyData length

    try {
        while (isRunning && generationCount < currentGaConfig.maxGenerations) {
            generationCount++;
            for (const p of population) {
                if (!isRunning) return;
                p.fitness = calculateFitness(p.individual);
            }
            if (!isRunning) return;
            population.sort((a, b) => b.fitness - a.fitness);
            
            // --- ADDED DEBUG LOG ---
            if (config.DEBUG_MODE) { // Only log in debug mode
                console.log(`Optimization Worker: Sending progress. Generation: ${generationCount}, MaxGen: ${currentGaConfig.maxGenerations}, PopSize: ${currentGaConfig.populationSize}, Processed: ${generationCount * currentGaConfig.populationSize}`);
            }
            // --- END ADDED DEBUG LOG ---

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
