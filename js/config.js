// config.js
// IMPROVED: Added new parameters for severity bonus, AI integration, overlap penalty, and enhanced scoring

export const DEBUG_MODE = false;

// --- Default Strategy Parameters ---
export const DEFAULT_PARAMETERS = {
    STRATEGY_CONFIG: {
        // Learning and Weighting
        learningRate_success: 0.25,
        learningRate_failure: 0.15,
        maxWeight: 5.0,
        minWeight: 0.05,
        decayFactor: 0.92,

        // Pattern Recognition
        patternMinAttempts: 4,
        patternSuccessThreshold: 60,
        triggerMinAttempts: 4,
        triggerSuccessThreshold: 55,

        // Scoring Thresholds and Multipliers
        hitRateThreshold: 35,
        hitRateMultiplier: 1.2,
        maxStreakPoints: 25,
        streakMultiplier: 5,
        proximityMaxDistance: 5,
        proximityMultiplier: 2.5,
        maxNeighbourPoints: 20,
        neighbourMultiplier: 1.0,

        // AI Confidence (now integrated into scoring)
        aiConfidenceMultiplier: 15,
        minAiPointsForReason: 3,
        
        // NEW: AI Score Weight - how much AI probability contributes to final score
        aiScoreWeight: 15,

        // Adaptive Play Thresholds
        ADAPTIVE_STRONG_PLAY_THRESHOLD: 50,
        ADAPTIVE_PLAY_THRESHOLD: 25,
        LESS_STRICT_STRONG_PLAY_THRESHOLD: 35,
        LESS_STRICT_PLAY_THRESHOLD: 15,
        LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: 55,
        LESS_STRICT_MIN_STREAK: 3,
        SIMPLE_PLAY_THRESHOLD: 20,
        MIN_TREND_HISTORY_FOR_CONFIRMATION: 3,

        // Table Change Warning Parameters
        WARNING_ROLLING_WINDOW_SIZE: 10,
        WARNING_MIN_PLAYS_FOR_EVAL: 5,
        WARNING_LOSS_STREAK_THRESHOLD: 4,
        WARNING_ROLLING_WIN_RATE_THRESHOLD: 40,
        DEFAULT_AVERAGE_WIN_RATE: 45,
        WARNING_FACTOR_SHIFT_WINDOW_SIZE: 5,
        WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: 0.8,
        WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: 50,

        // Pocket Distance Multipliers
        LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.5,
        HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: 0.5,
        
        // Conditional Probability Parameters
        conditionalProbMultiplier: 10,
        minConditionalSampleSize: 5,
        
        // NEW: Severity Bonus Parameters (for number context integration)
        severityMultiplier: 5,      // How much severity bonus contributes to score
        severityThreshold: 0.5,     // Minimum severity ratio to trigger bonus
        
        // NEW: Overlap Penalty Parameters
        overlapPenaltyWeight: 0.2,  // Weight of overlap penalty (0-1)
        overlapPenaltyWindow: 5     // Number of recent failures to consider
    },
    ADAPTIVE_LEARNING_RATES: {
        SUCCESS: 0.15, 
        FAILURE: 0.1,  
        MIN_INFLUENCE: 0.2, 
        MAX_INFLUENCE: 2.5,
        FORGET_FACTOR: 0.995,
        CONFIDENCE_WEIGHTING_MULTIPLIER: 0.02,
        CONFIDENCE_WEIGHTING_MIN_THRESHOLD: 5
    },
    TOGGLES: {
        useTrendConfirmation: false,
        useWeightedZone: false,
        useProximityBoost: false,
        usePocketDistance: false,
        useLowestPocketDistance: false, 
        useAdvancedCalculations: false,
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
            ...DEFAULT_PARAMETERS.STRATEGY_CONFIG,
            learningRate_success: 0.35,
            learningRate_failure: 0.05,
            maxWeight: 6.0,
            minWeight: 0.03,
            decayFactor: 0.88,
            patternMinAttempts: 5,
            patternSuccessThreshold: 68,
            triggerMinAttempts: 5,
            triggerSuccessThreshold: 63,
            ADAPTIVE_STRONG_PLAY_THRESHOLD: 60,
            ADAPTIVE_PLAY_THRESHOLD: 30,
            WARNING_LOSS_STREAK_THRESHOLD: 5,
            WARNING_ROLLING_WIN_RATE_THRESHOLD: 35,
            WARNING_FACTOR_SHIFT_WINDOW_SIZE: 7,
            WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: 0.7,
            WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: 40,
            LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 2.0,
            conditionalProbMultiplier: 12,
            minConditionalSampleSize: 4,
            // Enhanced for highest win rate
            aiScoreWeight: 20,
            severityMultiplier: 8,
            severityThreshold: 0.4,
            overlapPenaltyWeight: 0.3
        },
        ADAPTIVE_LEARNING_RATES: {
            ...DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES,
            FORGET_FACTOR: 0.99,
            CONFIDENCE_WEIGHTING_MULTIPLIER: 0.015,
        },
        TOGGLES: { 
            ...DEFAULT_PARAMETERS.TOGGLES, 
            useTrendConfirmation: true, 
            useWeightedZone: true, 
            useProximityBoost: true, 
            useLessStrict: false, 
            useAdaptivePlay: true, 
            useTableChangeWarnings: true, 
            useLowestPocketDistance: true 
        }
    },
    aggressiveSignals: {
        STRATEGY_CONFIG: {
            ...DEFAULT_PARAMETERS.STRATEGY_CONFIG,
            ADAPTIVE_STRONG_PLAY_THRESHOLD: 40,
            ADAPTIVE_PLAY_THRESHOLD: 15,
            WARNING_LOSS_STREAK_THRESHOLD: 6,
            WARNING_ROLLING_WIN_RATE_THRESHOLD: 30,
            WARNING_FACTOR_SHIFT_WINDOW_SIZE: 10,
            WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: 0.5,
            WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: 30,
            LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.8,
            HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: 0.2,
            conditionalProbMultiplier: 15,
            minConditionalSampleSize: 3,
            // Aggressive settings
            aiScoreWeight: 25,
            severityMultiplier: 10,
            severityThreshold: 0.3,
            overlapPenaltyWeight: 0.1
        },
        ADAPTIVE_LEARNING_RATES: {
            ...DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES,
            FORGET_FACTOR: 0.98,
            CONFIDENCE_WEIGHTING_MULTIPLIER: 0.025,
        },
        TOGGLES: { 
            ...DEFAULT_PARAMETERS.TOGGLES, 
            useTrendConfirmation: true, 
            useWeightedZone: true, 
            useProximityBoost: true, 
            useLessStrict: true, 
            useAdaptivePlay: true,
            useTableChangeWarnings: true, 
            useLowestPocketDistance: true 
        }
    },
    conservative: {
        STRATEGY_CONFIG: {
            ...DEFAULT_PARAMETERS.STRATEGY_CONFIG,
            learningRate_success: 0.15,
            learningRate_failure: 0.2,
            maxWeight: 4.0,
            minWeight: 0.1,
            decayFactor: 0.95,
            ADAPTIVE_STRONG_PLAY_THRESHOLD: 65,
            ADAPTIVE_PLAY_THRESHOLD: 40,
            WARNING_LOSS_STREAK_THRESHOLD: 3,
            WARNING_ROLLING_WIN_RATE_THRESHOLD: 45,
            LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.2,
            conditionalProbMultiplier: 8,
            minConditionalSampleSize: 7,
            // Conservative settings
            aiScoreWeight: 10,
            severityMultiplier: 3,
            severityThreshold: 0.6,
            overlapPenaltyWeight: 0.4
        },
        ADAPTIVE_LEARNING_RATES: {
            ...DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES,
            FORGET_FACTOR: 0.999,
            CONFIDENCE_WEIGHTING_MULTIPLIER: 0.01,
        },
        TOGGLES: { 
            ...DEFAULT_PARAMETERS.TOGGLES, 
            useTrendConfirmation: true, 
            useWeightedZone: true, 
            useProximityBoost: false, 
            useLessStrict: false, 
            useAdaptivePlay: true, 
            useTableChangeWarnings: true, 
            useLowestPocketDistance: false 
        }
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

export const rouletteWheel = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

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
    populationSize: 50,
    mutationRate: 0.15,
    crossoverRate: 0.7,
    eliteCount: 4,
    maxGenerations: 100
};

// --- AI Model Configuration ---
export const AI_CONFIG = {
    sequenceLength: 8,          // IMPROVED: Increased from 5
    trainingMinHistory: 15,     // IMPROVED: Increased from 10
    failureModes: ['none', 'normalLoss', 'streakBreak', 'sectionShift'],
    ensemble_config: [
        {
            name: 'Specialist',
            path: 'roulette-ml-model-specialist',
            lstmUnits: 24,      // IMPROVED: Increased from 16
            epochs: 50,         // IMPROVED: Increased from 40
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

// --- Active (modifiable) copies of parameters ---
export let STRATEGY_CONFIG = { ...DEFAULT_PARAMETERS.STRATEGY_CONFIG };
export let ADAPTIVE_LEARNING_RATES = { ...DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES };