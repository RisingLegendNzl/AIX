// optimizationWorker.js - Genetic Algorithm for Parameter Optimization

// Import the shared logic file. This is MUCH more robust than rebuilding functions from strings.
import * as shared from './shared-logic.js';
import * as config from './config.js';

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
    // ========================================================================
    // TEMPORARY DEBUGGING STEP: 
    // The real calculation is too slow. We are returning a random value 
    // to test if the rest of the evolution loop is working correctly.
    // ========================================================================
    return Math.random();

    /* --- ORIGINAL HEAVY CALCULATION (DISABLED FOR NOW) ---
    const SIM_STRATEGY_CONFIG = { ... };
    const SIM_ADAPTIVE_LEARNING_RATES = { ... };
    // ... all the simulation loops ...
    return wins / losses;
    */
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
    } catch (error) {
        console.error("Error during evolution:", error);
        self.postMessage({
            type: 'error',
            payload: {
                message: error.message
            }
        });
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
            // Immediately notify the main thread to update the UI
            self.postMessage({ type: 'stopped' }); 
            break;
    }
};
