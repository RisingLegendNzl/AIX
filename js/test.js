// js/config.js

export const DEBUG_MODE = true;

// --- Core Strategy Configuration ---
export let STRATEGY_CONFIG = {
    learningRate_success: 0.35, 
    learningRate_failure: 0.05, 
    maxWeight: 6.0,             
    minWeight: 0.03,            
    decayFactor: 0.88,          
    patternMinAttempts: 5,      
    patternSuccessThreshold: 68,
    triggerMinAttempts: 5,      
    triggerSuccessThreshold: 63,
};

// --- Adaptive Learning Rates for Factor Influences ---
export let ADAPTIVE_LEARNING_RATES = {
    SUCCESS: 0.15, 
    FAILURE: 0.1,  
    MIN_INFLUENCE: 0.2, 
    MAX_INFLUENCE: 2.5,
};

// --- DEFAULT PARAMETERS ---
export const DEFAULT_PARAMETERS = {
    STRATEGY_CONFIG: {
        learningRate_success: 0.30, 
        learningRate_failure: 0.03, 
        maxWeight: 5.0,             
        minWeight: 0.03,            
        decayFactor: 0.88,          
        patternMinAttempts: 5,      
        patternSuccessThreshold: 68,
        triggerMinAttempts: 5,      
        triggerSuccessThreshold: 63,
    },
    ADAPTIVE_LEARNING_RATES: {
        SUCCESS: 0.15, 
        FAILURE: 0.1,  
        MIN_INFLUENCE: 0.2, 
        MAX_INFLUENCE: 2.5,
    },
    TOGGLES: {
        useDynamicStrategy: false,
        useAdaptivePlay: false,
        useTableChangeWarnings: false,
        useDueForHit: false,
        useNeighbourFocus: false,
        useLessStrict: false,
        useDynamicTerminalNeighbourCount: false,
    }
};

// --- STRATEGY PRESETS ---
export const STRATEGY_PRESETS = {
    highestWinRate: {
        STRATEGY_CONFIG: {
            learningRate_success: 0.35,
            learningRate_failure: 0.05,
            maxWeight: 6.0,
            minWeight: 0.03,
            decayFactor: 0.88,
            patternMinAttempts: 5,
            patternSuccessThreshold: 68,
            triggerMinAttempts: 5,
            triggerSuccessThreshold: 63,
        },
        ADAPTIVE_LEARNING_RATES: {
            SUCCESS: 0.15,
            FAILURE: 0.1,
            MIN_INFLUENCE: 0.2,
            MAX_INFLUENCE: 2.5,
        },
        TOGGLES: {
            ...DEFAULT_PARAMETERS.TOGGLES,
            useTrendConfirmation: true,
            useWeightedZone: true,
            useProximityBoost: false,
            useAdvancedCalculations: true,
            useDynamicStrategy: true,
            useAdaptivePlay: true,
            useNeighbourFocus: true,
            useDynamicTerminalNeighbourCount: true
        }
    },
    balancedSafe: {
        STRATEGY_CONFIG: DEFAULT_PARAMETERS.STRATEGY_CONFIG,
        ADAPTIVE_LEARNING_RATES: DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES,
        TOGGLES: { ...DEFAULT_PARAMETERS.TOGGLES, useTrendConfirmation: true, useWeightedZone: true, useProximityBoost: true }
    },
    aggressiveSignals: {
        STRATEGY_CONFIG: DEFAULT_PARAMETERS.STRATEGY_CONFIG,
        ADAPTIVE_LEARNING_RATES: DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES,
        TOGGLES: { ...DEFAULT_PARAMETERS.TOGGLES, useTrendConfirmation: true, useWeightedZone: true, useProximityBoost: true, useLessStrict: true }
    }
};

// --- Core Roulette Data ---
export const terminalMapping = {
    0: [4, 6], 1: [8], 2: [7, 9], 3: [8], 4: [11], 5: [12, 10], 6: [11], 7: [14, 2],
    8: [15, 13, 3, 1], 9: [14, 2], 10: [17, 5], 11: [18, 16, 6, 4], 12: [17, 5],
    13: [20, 23], 14: [9, 21, 7, 19], 15: [8, 20], 16: [11], 17: [12, 24, 10, 22],
    18: [11, 23], 19: [14, 26], 20: [13, 25, 15, 27], 21: [14, 26], 22: [17, 29],
    23: [18, 30, 16, 28], 24: [17, 29], 25: [20, 32], 26: [19, 31, 33, 21],
    27: [20, 32], 28: [23, 35], 29: [22, 34, 24, 36], 30: [23, 35], 31: [26],
    32: [25, 27], 33: [26], 34: [29], 35: [28, 30], 36: [29]
};
export const rouletteWheel = [0, 26, 3, 35, 12, 28, 7, 29, 18, 22, 9, 31, 14, 20, 1, 33, 16, 24, 5, 10, 23, 8, 30, 11, 36, 13, 27, 6, 34, 17, 25, 2, 21, 4, 19, 15, 32];

// --- Prediction Types ---
export const allPredictionTypes = [
    { id: 'diffMinus', label: 'Minus', displayLabel: 'Minus Group', colorClass: 'bg-amber-500', calculateBase: (n1, n2) => Math.abs(n2 - n1) - 1 },
    { id: 'diffResult', label: 'Result', displayLabel: 'Result Group', colorClass: 'bg-blue-500', textColor: '#2563eb', calculateBase: (n1, n2) => Math.abs(n2 - n1) },
    { id: 'diffPlus', label: 'Plus', displayLabel: 'Plus Group', colorClass: 'bg-red-500', textColor: '#dc2626', calculateBase: (n1, n2) => Math.abs(n2 - n1) + 1 },
    { id: 'sumMinus', label: 'Sum (-1)', displayLabel: '+ and -1', colorClass: 'bg-sumMinus', textColor: '#8b5cf6', calculateBase: (n1, n2) => (n1 + n2) - 1 },
    { id: 'sumResult', label: 'Sum Result', displayLabel: '+', colorClass: 'bg-sumResult', textColor: '#10b981', calculateBase: (n1, n2) => (n1 + n2) },
    { id: 'sumPlus', label: 'Sum (+1)', displayLabel: '+ and +1', colorClass: 'bg-sumPlus', textColor: '#f43f5e', calculateBase: (n1, n2) => (n1 + n2) + 1 }
];

export const clonablePredictionTypes = allPredictionTypes.map(type => ({
    id: type.id,
    label: type.label,
    displayLabel: type.displayLabel,
    colorClass: type.colorClass,
    textColor: type.textColor
}));

// --- Genetic Algorithm Configuration ---
export const GA_CONFIG = {
    populationSize: 1, // TEMPORARY: Set to 1 for precise debugging
    mutationRate: 0.15,
    crossoverRate: 0.7,
    eliteCount: 1,      // TEMPORARY: Set to 1
    maxGenerations: 1   // TEMPORARY: Set to 1 for precise debugging
};

// --- AI Model Configuration ---
export const AI_CONFIG = {
    sequenceLength: 5,
    trainingMinHistory: 10,
    failureModes: ['none', 'normalLoss', 'streakBreak', 'sectionShift'],
    ensemble_config: [
        {
            name: 'Specialist',
            path: 'roulette-ml-model-specialist',
            lstmUnits: 16,
            epochs: 40,
            batchSize: 32,
        },
        {
            name: 'Generalist',
            path: 'roulette-ml-model-generalist',
            lstmUnits: 64,
            epochs: 60,
            batchSize: 16,
        }
    ]
};