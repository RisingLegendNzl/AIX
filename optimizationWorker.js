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
    maxAdaptiveInfluence: { min: 1.0, max: 5.0, step: 0.1 }
};
let historyData = [];
let sharedData = {};
let isRunning = false;
let generationCount = 0;

function createIndividual() { /* ... unchanged ... */ }
function crossover(parent1, parent2) { /* ... unchanged ... */ }
function mutate(individual) { /* ... unchanged ... */ }
function selectParent(population) { /* ... unchanged ... */ }

function calculateFitness(individual) {
    // Keep this simplified for debugging
    return Math.random();
}

async function runEvolution() {
    console.log("WORKER: runEvolution started.");
    isRunning = true;
    generationCount = 0;
    let population = [];

    console.log("WORKER: Creating initial population...");
    for (let i = 0; i < currentGaConfig.populationSize; i++) {
        population.push({ individual: createIndividual(), fitness: 0 });
    }
    console.log("WORKER: Initial population created.");

    try {
        while (isRunning && generationCount < currentGaConfig.maxGenerations) {
            generationCount++;
            console.log(`WORKER: Starting Generation ${generationCount}`);

            console.log(`WORKER: Calculating fitness for ${population.length} individuals...`);
            for (const p of population) {
                if (!isRunning) return;
                p.fitness = calculateFitness(p.individual);
            }
            console.log("WORKER: Fitness calculation complete.");

            if (!isRunning) return;

            console.log("WORKER: Sorting population...");
            population.sort((a, b) => b.fitness - a.fitness);
            console.log("WORKER: Population sorted.");

            console.log("WORKER: Posting progress message to main thread...");
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
            console.log("WORKER: Progress message sent.");

            const newPopulation = [];
            console.log("WORKER: Creating new population (Elitism)...");
            for (let i = 0; i < currentGaConfig.eliteCount; i++) {
                newPopulation.push(population[i]);
            }
            console.log("WORKER: Creating new population (Crossover & Mutation)...");
            while (newPopulation.length < currentGaConfig.populationSize) {
                if (!isRunning) return;
                const parent1 = selectParent(population);
                const parent2 = selectParent(population);
                let child = (Math.random() < currentGaConfig.crossoverRate) ? crossover(parent1.individual, parent2.individual) : { ...parent1.individual };
                child = mutate(child);
                newPopulation.push({ individual: child, fitness: 0 });
            }
            population = newPopulation;
            console.log("WORKER: New population created.");
        }

        if (isRunning) {
            console.log("WORKER: Evolution complete.");
            self.postMessage({
                type: 'complete',
                payload: { /* ... */ }
            });
        }
    } catch (error) {
        console.error("WORKER: Error during evolution:", error);
        self.postMessage({ type: 'error', payload: { message: error.message } });
    } finally {
        console.log("WORKER: runEvolution finished.");
        isRunning = false;
    }
}

self.onmessage = (event) => {
    const { type, payload } = event.data;
    console.log(`WORKER: Message received - Type: ${type}`);
    switch (type) {
        case 'start':
            if (isRunning) {
                console.log("WORKER: 'start' received but already running.");
                return;
            }
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
            console.log("WORKER: 'stop' message received.");
            isRunning = false;
            self.postMessage({ type: 'stopped' });
            break;
    }
};
