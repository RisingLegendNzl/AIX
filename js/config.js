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

    // NEW: Recommendation Scoring Multipliers & Thresholds (used in shared-logic.js)
    hitRateThreshold: 40,        // Below this hit rate, points start from 0 for hitRatePoints
    hitRateMultiplier: 0.5,      // Points = (HitRate - threshold) * multiplier
    maxStreakPoints: 15,         // Max points a streak can contribute
    streakMultiplier: 5,         // Points = currentStreak * multiplier
    proximityMaxDistance: 5,     // Max pocket distance for proximity boost to apply
    proximityMultiplier: 2,      // Points = (MaxDistance - actualDistance) * multiplier
    maxNeighbourPoints: 10,      // Max points neighbour weighting can contribute
    neighbourMultiplier: 0.5,    // Points = neighbourWeightedScore * multiplier
    aiConfidenceMultiplier: 25,  // Points = mlProbability * multiplier
    minAiPointsForReason: 5,     // Min AI points for 'AI Conf' to appear in reason list

    // NEW: Adaptive Play Signal Thresholds (used in shared-logic.js)
    // When useAdaptivePlay is ON
    ADAPTIVE_STRONG_PLAY_THRESHOLD: 50, // Score needed for "Strong Play"
    ADAPTIVE_PLAY_THRESHOLD: 20,        // Score needed for "Play" (below Strong, above Wait)

    // When useAdaptivePlay is ON and useLessStrict is ON
    LESS_STRICT_STRONG_PLAY_THRESHOLD: 40, // Lower score for "Strong Play" in less strict mode
    LESS_STRICT_PLAY_THRESHOLD: 10,        // Lower score for "Play" in less strict mode
    LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: 60, // Alternative condition for Less Strict Strong Play (e.g. if hitRate > 60% and minStreak)
    LESS_STRICT_MIN_STREAK: 3,             // Min streak for Less Strict Strong Play (with high hit rate)

    // When useAdaptivePlay is OFF (simple fallback logic)
    SIMPLE_PLAY_THRESHOLD: 20,           // Simple threshold for "Play" vs "Wait"

    // NEW: Trend Confirmation Threshold (used in shared-logic.js)
    MIN_TREND_HISTORY_FOR_CONFIRMATION: 3, // Minimum successful plays needed to even consider trend confirmation

    // NEW: Table Change Warning Parameters (used in analysis.js and shared-logic.js)
    WARNING_ROLLING_WINDOW_SIZE: 10,      // Number of recent "plays" to consider for rolling performance
    WARNING_MIN_PLAYS_FOR_EVAL: 5,        // Minimum number of plays within window to trigger evaluation
    WARNING_LOSS_STREAK_THRESHOLD: 4,     // Consecutive "play" losses to trigger a warning
    WARNING_ROLLING_WIN_RATE_THRESHOLD: 40, // Rolling win rate % below which a warning is triggered
    DEFAULT_AVERAGE_WIN_RATE: 45,          // Baseline expected win rate if insufficient history for true average
    // NEW: Parameters for Primary Factor Shift Detection
    WARNING_FACTOR_SHIFT_WINDOW_SIZE: 5, // Number of recent successful plays to check for factor shifts
    WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: 0.8, // If primary factors are too diverse (e.g., >80% are different), warn
    WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: 50, // Min percentage of one factor needed for it to be 'dominant'


    // NEW: Pocket Distance Prioritization Multipliers (for useLowestPocketDistance)
    LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.5, // Multiplier to boost score if distance is 0 or 1
    HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: 0.5 // Multiplier to suppress score if distance is > 1 but others are low
};

// --- Adaptive Learning Rates for Factor Influences ---
export let ADAPTIVE_LEARNING_RATES = {
    SUCCESS: 0.15, 
    FAILURE: 0.1,  
    MIN_INFLUENCE: 0.2, 
    MAX_INFLUENCE: 2.5,
    // NEW: Forgetfulness factor for adaptive influences
    FORGET_FACTOR: 0.995, // Multiplier applied to influences each spin (e.g., 0.995 means 0.5% decay per spin)
    // NEW: Confidence weighting for adaptive influence updates
    CONFIDENCE_WEIGHTING_MULTIPLIER: 0.02, // How much finalScore impacts the influence change
    CONFIDENCE_WEIGHTING_MIN_THRESHOLD: 5, // Below this finalScore, confidence weighting has less effect
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

        // Defaults for new scoring parameters
        hitRateThreshold: 40,
        hitRateMultiplier: 0.5,
        maxStreakPoints: 15,
        streakMultiplier: 5,
        proximityMaxDistance: 5,
        proximityMultiplier: 2,
        maxNeighbourPoints: 10,
        neighbourMultiplier: 0.5,
        aiConfidenceMultiplier: 25,
        minAiPointsForReason: 5,

        ADAPTIVE_STRONG_PLAY_THRESHOLD: 50,
        ADAPTIVE_PLAY_THRESHOLD: 20,
        LESS_STRICT_STRONG_PLAY_THRESHOLD: 40,
        LESS_STRICT_PLAY_THRESHOLD: 10,
        LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: 60,
        LESS_STRICT_MIN_STREAK: 3,
        SIMPLE_PLAY_THRESHOLD: 20,
        MIN_TREND_HISTORY_FOR_CONFIRMATION: 3,

        // Defaults for new Table Change Warning Parameters
        WARNING_ROLLING_WINDOW_SIZE: 10,
        WARNING_MIN_PLAYS_FOR_EVAL: 5,
        WARNING_LOSS_STREAK_THRESHOLD: 4,
        WARNING_ROLLING_WIN_RATE_THRESHOLD: 40,
        DEFAULT_AVERAGE_WIN_RATE: 45,
        WARNING_FACTOR_SHIFT_WINDOW_SIZE: 5,
        WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: 0.8,
        WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: 50,

        // Defaults for new Pocket Distance Prioritization
        LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.5,
        HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: 0.5
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
            ...DEFAULT_PARAMETERS.STRATEGY_CONFIG, // Inherit all default config params
            learningRate_success: 0.35,
            learningRate_failure: 0.05,
            maxWeight: 6.0,
            minWeight: 0.03,
            decayFactor: 0.88,
            patternMinAttempts: 5,
            patternSuccessThreshold: 68,
            triggerMinAttempts: 5,
            triggerSuccessThreshold: 63,
            // Ensure new scoring parameters are set explicitly or inherited if desired
            ADAPTIVE_STRONG_PLAY_THRESHOLD: 60, // Higher threshold for this preset
            ADAPTIVE_PLAY_THRESHOLD: 30,
            // Adjust warning thresholds for this preset if desired
            WARNING_LOSS_STREAK_THRESHOLD: 5, // More tolerant of losses for high win rate
            WARNING_ROLLING_WIN_RATE_THRESHOLD: 35, // More tolerant of lower rolling win rate
            WARNING_FACTOR_SHIFT_WINDOW_SIZE: 7, // Longer window for factor shift
            WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: 0.7, // Slightly less strict diversity
            WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: 40, // Lower dominance for warning
            // Pocket distance for preset
            LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 2.0, // More aggressive boost
        },
        ADAPTIVE_LEARNING_RATES: {
            SUCCESS: 0.15,
            FAILURE: 0.1,
            MIN_INFLUENCE: 0.2,
            MAX_INFLUENCE: 2.5,
            FORGET_FACTOR: 0.99, // Slightly faster forgetting for potentially higher win rate
            CONFIDENCE_WEIGHTING_MULTIPLIER: 0.03, // Higher influence change
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
            ...DEFAULT_PARAMETERS.STRATEGY_CONFIG, // Inherits new defaults
            // Maybe tighter warning thresholds for a "safe" preset
            WARNING_LOSS_STREAK_THRESHOLD: 3,
            WARNING_ROLLING_WIN_RATE_THRESHOLD: 45,
            WARNING_FACTOR_SHIFT_WINDOW_SIZE: 5,
            WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: 0.9, // Very strict diversity check
            WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: 60, // Higher dominance needed
            // Pocket distance for preset
            LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.2, // Moderate boost
        },
        ADAPTIVE_LEARNING_RATES: {
            ...DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES,
            FORGET_FACTOR: 0.998, // Slower forgetting for stability
            CONFIDENCE_WEIGHTING_MULTIPLIER: 0.015, // Moderate influence change
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
    },
    aggressiveSignals: {
        STRATEGY_CONFIG: {
            ...DEFAULT_PARAMETERS.STRATEGY_CONFIG, // Inherits new defaults
            // Potentially lower thresholds for more signals in aggressive mode
            ADAPTIVE_STRONG_PLAY_THRESHOLD: 40,
            ADAPTIVE_PLAY_THRESHOLD: 15,
            // Less strict warnings for aggressive play
            WARNING_LOSS_STREAK_THRESHOLD: 6,
            WARNING_ROLLING_WIN_RATE_THRESHOLD: 30,
            WARNING_FACTOR_SHIFT_WINDOW_SIZE: 10, // Longer window for factor shift
            WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: 0.5, // Very loose diversity
            WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: 30, // Very low dominance needed
            // Pocket distance for preset
            LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.8, // Aggressive boost
            HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: 0.2
        },
        ADAPTIVE_LEARNING_RATES: {
            ...DEFAULT_PARAMETERS.ADAPTIVE_LEARNING_RATES,
            FORGET_FACTOR: 0.98, // Very aggressive forgetting
            CONFIDENCE_WEIGHTING_MULTIPLIER: 0.025, // Higher influence change
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
    populationSize: 50, // RESTORED to original value
    mutationRate: 0.15,
    crossoverRate: 0.7,
    eliteCount: 4,      // RESTORED to original value
    maxGenerations: 100 // RESTORED to original value
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
