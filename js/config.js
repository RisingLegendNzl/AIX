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

    // Recommendation Scoring Multipliers & Thresholds
    hitRateThreshold: 40,        // Below this hit rate, points start from 0 for hitRatePoints
    hitRateMultiplier: 0.5,      // Points = (HitRate - threshold) * multiplier
    maxStreakPoints: 15,         // Max points a streak can contribute
    streakMultiplier: 5,         // Points = currentStreak * multiplier
    proximityMaxDistance: 5,     // Max pocket distance for proximity boost to apply
    proximityMultiplier: 2,      // Points = (MaxDistance - actualDistance) * multiplier
    maxNeighbourPoints: 10,      // Max points neighbour weighting can contribute
    neighbourMultiplier: 0.5,    // Points = neighbourWeightedScore * multiplier
    
    // AI Confidence - DISABLED for scoring (display only)
    // AI recommendations have shown poor accuracy; points should NOT inflate group scores
    aiConfidenceMultiplier: 0,   // Set to 0 to disable AI points contribution
    minAiPointsForReason: 5,     // Min AI points for 'AI Conf' to appear in reason list

    // Adaptive Play Signal Thresholds
    ADAPTIVE_STRONG_PLAY_THRESHOLD: 50, // Score needed for "Strong Play"
    ADAPTIVE_PLAY_THRESHOLD: 20,        // Score needed for "Play" (below Strong, above Wait)

    // Less Strict Mode Thresholds
    LESS_STRICT_STRONG_PLAY_THRESHOLD: 40,
    LESS_STRICT_PLAY_THRESHOLD: 10,
    LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: 60,
    LESS_STRICT_MIN_STREAK: 3,
    
    // Simple Mode Threshold
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

    // Pocket Distance Prioritization
    LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.5,
    HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: 0.5,
    
    // Conditional Probability (session data only)
    conditionalProbMultiplier: 10,
    minConditionalSampleSize: 5
};

// --- ADAPTIVE LEARNING RATES ---
export let ADAPTIVE_LEARNING_RATES = {
    SUCCESS: 0.15,
    FAILURE: 0.1,
    MIN_INFLUENCE: 0.2, 
    MAX_INFLUENCE: 2.5,
    FORGET_FACTOR: 0.995,
    CONFIDENCE_WEIGHTING_MULTIPLIER: 0.02,
    CONFIDENCE_WEIGHTING_MIN_THRESHOLD: 5,
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

        // Defaults for scoring parameters
        hitRateThreshold: 40,
        hitRateMultiplier: 0.5,
        maxStreakPoints: 15,
        streakMultiplier: 5,
        proximityMaxDistance: 5,
        proximityMultiplier: 2,
        maxNeighbourPoints: 10,
        neighbourMultiplier: 0.5,
        
        // AI Confidence DISABLED - do not add points based on AI recommendations
        aiConfidenceMultiplier: 0,
        minAiPointsForReason: 5,

        ADAPTIVE_STRONG_PLAY_THRESHOLD: 50,
        ADAPTIVE_PLAY_THRESHOLD: 20,
        LESS_STRICT_STRONG_PLAY_THRESHOLD: 40,
        LESS_STRICT_PLAY_THRESHOLD: 10,
        LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: 60,
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

        // Pocket Distance Prioritization
        LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.5,
        HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: 0.5,
        
        // Conditional probability
        conditionalProbMultiplier: 10,
        minConditionalSampleSize: 5
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
        useAdvancedCalculations: true,  // ENABLED by default - no manual enabling needed
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
            minConditionalSampleSize: 4
        },
        ADAPTIVE_LEARNING_RATES: {
            SUCCESS: 0.15,
            FAILURE: 0.1,
            MIN_INFLUENCE: 0.2,
            MAX_INFLUENCE: 2.5,
            FORGET_FACTOR: 0.99,
            CONFIDENCE_WEIGHTING_MULTIPLIER: 0.03,
        },
        TOGGLES: {
            ...DEFAULT_PARAMETERS.TOGGLES,
            useTrendConfirmation: true,
            useWeightedZone: true,
            useProximityBoost: true, 
            useAdvancedCalculations: true,
            useDynamicStrategy: true,
            useAdaptivePlay: true, 
            useNeighbourFocus: true,
            useDynamicTerminalNeighbourCount: true,
            useLessStrict: false,
            useTableChangeWarnings: true, 
            useLowestPocketDistance: true 
        }
    },
    balancedSafe: {
        STRATEGY_CONFIG: {
            ...DEFAULT_PARAMETERS.STRATEGY_CONFIG,
            WARNING_LOSS_STREAK_THRESHOLD: 3,
            WARNING_ROLLING_WIN_RATE_THRESHOLD: 45,
            WARNING_FACTOR_SHIFT_WINDOW_SIZE: 5,
            WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: 0.9,
            WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: 60,
            LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.2,
            conditionalProbMultiplier: 8,
            minConditionalSampleSize: 6
        },
        ADAPTIVE_LEARNING_RATES: {
            ...DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES,
            FORGET_FACTOR: 0.998,
            CONFIDENCE_WEIGHTING_MULTIPLIER: 0.015,
        },
        TOGGLES: { 
            ...DEFAULT_PARAMETERS.TOGGLES, 
            useTrendConfirmation: true, 
            useWeightedZone: true, 
            useProximityBoost: true,
            useAdaptivePlay: true, 
            useLessStrict: false,
            useTableChangeWarnings: true, 
            useLowestPocketDistance: true 
        }
    }
};

// --- AI CONFIG ---
export const AI_CONFIG = {
    trainingMinHistory: 10,
    sequenceLength: 5,
    predictionWindow: 3,
    batchSize: 16,
    epochs: 50,
    learningRate: 0.001,
    hiddenUnits: 64,
    numLayers: 2,
    dropout: 0.2
};

// --- GENETIC ALGORITHM CONFIG ---
export const GA_CONFIG = {
    populationSize: 50,
    generations: 100,
    mutationRate: 0.1,
    crossoverRate: 0.7,
    elitismCount: 5,
    tournamentSize: 3
};

// --- ROULETTE WHEEL ---
export const rouletteWheel = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

// --- TERMINAL MAPPING ---
export const terminalMapping = {
    0: [10, 20, 30], 1: [11, 21, 31], 2: [12, 22, 32], 3: [13, 23, 33],
    4: [14, 24, 34], 5: [15, 25, 35], 6: [16, 26, 36], 7: [17, 27], 8: [18, 28],
    9: [19, 29], 10: [0, 20, 30], 11: [1, 21, 31], 12: [2, 22, 32], 13: [3, 23, 33],
    14: [4, 24, 34], 15: [5, 25, 35], 16: [6, 26, 36], 17: [7, 27], 18: [8, 28],
    19: [9, 29], 20: [0, 10, 30], 21: [1, 11, 31], 22: [2, 12, 32], 23: [3, 13, 33],
    24: [4, 14, 34], 25: [5, 15, 35], 26: [6, 16, 36], 27: [7, 17], 28: [8, 18],
    29: [9, 19], 30: [0, 10, 20], 31: [1, 11, 21], 32: [2, 12, 22], 33: [3, 13, 23],
    34: [4, 14, 24], 35: [5, 15, 25], 36: [6, 16, 26]
};

// --- ALL PREDICTION TYPES ---
export const allPredictionTypes = [
    { id: 'T1', label: 'T1', displayLabel: 'T1', colorClass: 'bg-blue-100', textColor: 'text-blue-700', calculateBase: (n1, n2) => Math.abs(n2 - n1) },
    { id: 'T2', label: 'T2', displayLabel: 'T2', colorClass: 'bg-green-100', textColor: 'text-green-700', calculateBase: (n1, n2) => (n1 + n2) % 37 },
    { id: 'T3', label: 'T3', displayLabel: 'T3', colorClass: 'bg-yellow-100', textColor: 'text-yellow-700', calculateBase: (n1, n2) => n2 },
    { id: 'T4', label: 'T4', displayLabel: 'T4', colorClass: 'bg-purple-100', textColor: 'text-purple-700', calculateBase: (n1, n2) => (n1 * n2) % 37 },
    { id: 'T5', label: 'T5', displayLabel: 'T5', colorClass: 'bg-pink-100', textColor: 'text-pink-700', calculateBase: (n1, n2) => Math.abs(n2 - n1 - 1) },
    { id: 'T6', label: 'T6', displayLabel: 'T6', colorClass: 'bg-indigo-100', textColor: 'text-indigo-700', calculateBase: (n1, n2) => (n1 + n2 + 1) % 37 },
    { id: 'T7', label: 'T7', displayLabel: 'T7', colorClass: 'bg-red-100', textColor: 'text-red-700', calculateBase: (n1, n2) => Math.abs(n2 - n1 + 1) % 37 },
    { id: 'T8', label: 'T8', displayLabel: 'T8', colorClass: 'bg-orange-100', textColor: 'text-orange-700', calculateBase: (n1, n2) => (n1 * 2 + n2) % 37 },
    { id: 'T9', label: 'T9', displayLabel: 'T9', colorClass: 'bg-teal-100', textColor: 'text-teal-700', calculateBase: (n1, n2) => (n1 + n2 * 2) % 37 },
    { id: 'T10', label: 'T10', displayLabel: 'T10', colorClass: 'bg-cyan-100', textColor: 'text-cyan-700', calculateBase: (n1, n2) => Math.abs(n2 * 2 - n1) % 37 },
    { id: 'T11', label: 'T11', displayLabel: 'T11', colorClass: 'bg-lime-100', textColor: 'text-lime-700', calculateBase: (n1, n2) => Math.abs(n1 * 2 - n2) % 37 },
    { id: 'T12', label: 'T12', displayLabel: 'T12', colorClass: 'bg-amber-100', textColor: 'text-amber-700', calculateBase: (n1, n2) => (n1 + n2 + n1 * n2) % 37 }
];