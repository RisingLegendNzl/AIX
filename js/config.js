// js/config.js

export const DEBUG_MODE = true;

// --- Conductor Mode Configuration ---
export const CONDUCTOR_CONFIG = {
    // Thresholds to enter Defensive Mode
    DEFENSIVE_LOSS_STREAK_THRESHOLD: 3, // Lower than the warning threshold to be more proactive
    DEFENSIVE_WIN_RATE_THRESHOLD: 45,   // Enter defensive mode if win rate drops below this
    DEFENSIVE_AI_FAILURE_PROB_THRESHOLD: 0.6, // If AI predicts >60% chance of any failure, get defensive

    // Thresholds to enter Aggressive Mode
    AGGRESSIVE_TREND_CONFIDENCE: 'high', // Trend worker must be 'high' confidence
    AGGRESSIVE_AI_FAILURE_PROB_THRESHOLD: 0.3, // AI must predict <30% chance of critical failures

    // Playstyle adjustments for each mode
    MODES: {
        standard: {
            // Uses the default STRATEGY_CONFIG values
            STRONG_PLAY_THRESHOLD: 50,
            PLAY_THRESHOLD: 20,
        },
        aggressive: {
            STRONG_PLAY_THRESHOLD: 35, // Lower threshold for strong plays
            PLAY_THRESHOLD: 15,        // Lower threshold for normal plays
        },
        defensive: {
            STRONG_PLAY_THRESHOLD: 70, // Much higher threshold for strong plays
            PLAY_THRESHOLD: 40,        // Higher threshold, very selective
        }
    }
};

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
    TREND_WORKER_BOOST: 20,

    // The thresholds below are now superseded by CONDUCTOR_CONFIG.MODES,
    // but are kept as a fallback for when the conductor is not active.
    ADAPTIVE_STRONG_PLAY_THRESHOLD: 50,
    ADAPTIVE_PLAY_THRESHOLD: 20,
    LESS_STRICT_STRONG_PLAY_THRESHOLD: 40,
    LESS_STRICT_PLAY_THRESHOLD: 10,
    LESS_STRICT_HIGH_HIT_RATE_THRESHOLD: 60,
    LESS_STRICT_MIN_STREAK: 3,
    SIMPLE_PLAY_THRESHOLD: 20,
    MIN_TREND_HISTORY_FOR_CONFIRMATION: 3,

    WARNING_ROLLING_WINDOW_SIZE: 10,
    WARNING_MIN_PLAYS_FOR_EVAL: 5,
    WARNING_LOSS_STREAK_THRESHOLD: 4,
    WARNING_ROLLING_WIN_RATE_THRESHOLD: 40,
    DEFAULT_AVERAGE_WIN_RATE: 45,
    WARNING_FACTOR_SHIFT_WINDOW_SIZE: 5,
    WARNING_FACTOR_SHIFT_DIVERSITY_THRESHOLD: 0.8,
    WARNING_FACTOR_SHIFT_MIN_DOMINANCE_PERCENT: 50,

    LOW_POCKET_DISTANCE_BOOST_MULTIPLIER: 1.5,
    HIGH_POCKET_DISTANCE_SUPPRESS_MULTIPLIER: 0.5
};

// ... rest of the config file is unchanged ...
