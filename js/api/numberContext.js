// js/api/numberContext.js - Number-Level Context Manager
// IMPROVED: Enhanced severity bonus calculation for scoring integration
// Manages individual number streak data (losses and historical max per number 0-36)
// Aggregates to calculation groups for contextual analysis

/**
 * IMPORTANT: This module provides CONTEXT, not PREDICTION.
 * Historical data is used to normalize current observations,
 * not to imply that numbers are "due" or more likely to hit.
 * Each spin is independent.
 */

// Severity thresholds (as ratios of historical max)
export const NUMBER_SEVERITY_THRESHOLDS = {
    NORMAL: 0.25,     // Below 25% of historical max
    MILD: 0.4,        // 25-40% of historical max  
    ELEVATED: 0.55,   // 40-55% of historical max
    HIGH: 0.7,        // 55-70% of historical max
    VERY_HIGH: 0.85,  // 70-85% of historical max
    EXTREME: 1.0      // 85%+ of historical max
};

// Default historical max for individual numbers (conservative estimates)
// Individual numbers have much higher non-appearance streaks than sectors
// Typical 5+ year max for a single number is around 200-400 spins
const DEFAULT_NUMBER_HISTORICAL_MAX = 300;

/**
 * Number Context Manager
 * Tracks individual number loss streaks and provides normalized severity context
 */
class NumberContextManager {
    constructor() {
        // Current loss streaks for each number (0-36)
        this.currentLossStreaks = {};
        
        // Historical max for each number (0-36)
        this.historicalMax = {};
        
        // Track which numbers have API-provided max values
        this.apiProvidedMaxNumbers = new Set();
        
        this.lastUpdated = null;
        this.dataSource = 'defaults'; // 'defaults' | 'api' | 'calculated'
        this.isInitialized = false;
        this.apiDataTimestamp = null;
        
        // Initialize default values for all numbers
        this._initializeDefaults();
    }

    /**
     * Initialize default values for all roulette numbers
     */
    _initializeDefaults() {
        for (let i = 0; i <= 36; i++) {
            this.currentLossStreaks[i] = 0;
            this.historicalMax[i] = DEFAULT_NUMBER_HISTORICAL_MAX;
        }
    }

    /**
     * Update from API number losses data
     * @param {Object} apiNumberLosses - Number losses data from API {0: {losses, max}, 1: {losses, max}, ...}
     * @returns {boolean} True if update was successful
     */
    updateFromApi(apiNumberLosses) {
        if (!apiNumberLosses) {
            console.warn('[NumberContext] No API number losses data provided');
            return false;
        }

        try {
            // Reset API-provided tracking
            this.apiProvidedMaxNumbers.clear();
            let hasAnyApiMax = false;

            // Process API data for each number
            if (Array.isArray(apiNumberLosses)) {
                // Array format: [{number: 0, losses: 5, max: 250}, ...]
                apiNumberLosses.forEach(entry => {
                    const num = parseInt(entry.number, 10);
                    if (num >= 0 && num <= 36) {
                        this.currentLossStreaks[num] = entry.losses || entry.current || 0;
                        if (entry.max && entry.max > 0) {
                            this.historicalMax[num] = entry.max;
                            this.apiProvidedMaxNumbers.add(num);
                            hasAnyApiMax = true;
                        }
                    }
                });
            } else if (typeof apiNumberLosses === 'object') {
                // Object format: {0: {losses: 5, max: 250}, 1: {losses: 3, max: 280}, ...}
                // Or simple format: {0: 5, 1: 3, ...} (losses only)
                for (const [key, data] of Object.entries(apiNumberLosses)) {
                    const num = parseInt(key, 10);
                    if (num >= 0 && num <= 36) {
                        if (typeof data === 'number') {
                            // Simple format: just losses
                            this.currentLossStreaks[num] = data;
                        } else if (typeof data === 'object') {
                            // Full format with losses and max
                            this.currentLossStreaks[num] = data.losses || data.current || 0;
                            if (data.max && data.max > 0) {
                                this.historicalMax[num] = data.max;
                                this.apiProvidedMaxNumbers.add(num);
                                hasAnyApiMax = true;
                            }
                        }
                    }
                }
            }

            this.dataSource = hasAnyApiMax ? 'api' : 'calculated';
            this.lastUpdated = new Date();
            this.apiDataTimestamp = new Date();
            this.isInitialized = true;

            console.log('[NumberContext] Updated from API:', {
                dataSource: this.dataSource,
                apiProvidedMaxCount: this.apiProvidedMaxNumbers.size,
                sampleData: {
                    number0: { losses: this.currentLossStreaks[0], max: this.historicalMax[0] },
                    number17: { losses: this.currentLossStreaks[17], max: this.historicalMax[17] }
                }
            });

            return true;
        } catch (error) {
            console.error('[NumberContext] Error processing API data:', error);
            return false;
        }
    }

    /**
     * Calculate number loss streaks from spin history
     * @param {Array<number>} spinHistory - Array of spin numbers (newest first)
     */
    calculateFromSpinHistory(spinHistory) {
        if (!spinHistory || spinHistory.length === 0) {
            return;
        }

        // Reset current streaks for all numbers
        for (let i = 0; i <= 36; i++) {
            this.currentLossStreaks[i] = 0;
        }

        // For each number, count consecutive spins where it did NOT appear
        for (let num = 0; num <= 36; num++) {
            let streak = 0;
            for (const spin of spinHistory) {
                if (spin === num) {
                    break; // Number hit, streak ends
                }
                streak++;
            }
            this.currentLossStreaks[num] = streak;
        }

        // Only change data source if we don't already have API data
        if (this.dataSource !== 'api') {
            this.dataSource = 'calculated';
        }
        this.lastUpdated = new Date();
        this.isInitialized = true;
    }

    /**
     * Get severity info for a specific number
     * @param {number} num - Roulette number (0-36)
     * @returns {Object} Severity info {currentLoss, historicalMax, ratio, level, description, isApiMax}
     */
    getNumberSeverity(num) {
        if (num < 0 || num > 36) {
            return {
                number: num,
                currentLoss: 0,
                historicalMax: DEFAULT_NUMBER_HISTORICAL_MAX,
                ratio: 0,
                level: 'invalid',
                description: 'invalid number',
                isApiMax: false
            };
        }

        const currentLoss = this.currentLossStreaks[num] || 0;
        const maxLoss = this.historicalMax[num] || DEFAULT_NUMBER_HISTORICAL_MAX;
        const isApiMax = this.apiProvidedMaxNumbers.has(num);

        const ratio = maxLoss > 0 ? currentLoss / maxLoss : 0;

        let level, description;
        if (ratio < NUMBER_SEVERITY_THRESHOLDS.NORMAL) {
            level = 'normal';
            description = 'within typical range';
        } else if (ratio < NUMBER_SEVERITY_THRESHOLDS.MILD) {
            level = 'mild';
            description = 'slightly extended';
        } else if (ratio < NUMBER_SEVERITY_THRESHOLDS.ELEVATED) {
            level = 'elevated';
            description = 'moderately extended';
        } else if (ratio < NUMBER_SEVERITY_THRESHOLDS.HIGH) {
            level = 'high';
            description = 'notably extended';
        } else if (ratio < NUMBER_SEVERITY_THRESHOLDS.VERY_HIGH) {
            level = 'very_high';
            description = 'significantly extended';
        } else {
            level = 'extreme';
            description = 'near historical extreme';
        }

        return {
            number: num,
            currentLoss,
            historicalMax: maxLoss,
            ratio: Math.min(ratio, 1.0), // Cap at 1.0
            level,
            description,
            isApiMax
        };
    }

    /**
     * IMPROVED: Calculate severity bonus for scoring
     * This provides a weighted score based on number severity ratios
     * NOT a prediction - just contextual weighting
     * @param {number} num - Roulette number (0-36)
     * @param {number} threshold - Minimum ratio to trigger bonus (default 0.5)
     * @returns {number} Severity bonus value (0 to ~2)
     */
    getSeverityBonus(num, threshold = 0.5) {
        const severity = this.getNumberSeverity(num);
        if (!severity || severity.level === 'invalid') {
            return 0;
        }

        // Only provide bonus above threshold
        if (severity.ratio < threshold) {
            return 0;
        }

        // Scale bonus from threshold to 1.0
        // Uses a smooth curve that increases more slowly at extremes
        const normalizedRatio = (severity.ratio - threshold) / (1.0 - threshold);
        
        // Apply diminishing returns curve
        // This prevents extreme values from having outsized impact
        return Math.sqrt(normalizedRatio) * 2;
    }

    /**
     * Calculate aggregate severity for a calculation group's hit zone
     * This is the key method that aggregates number-level data to groups
     * @param {Array<number>} hitZoneNumbers - Numbers in the group's hit zone (including neighbors)
     * @returns {Object} Aggregate severity context for the calculation group
     */
    calculateGroupContext(hitZoneNumbers) {
        if (!hitZoneNumbers || hitZoneNumbers.length === 0) {
            return {
                hasContext: false,
                aggregateSeverity: 0,
                maxSeverity: 0,
                avgLossStreak: 0,
                numbersAnalyzed: 0,
                elevatedNumbers: [],
                contextDescription: 'No numbers in hit zone',
                hasApiData: false,
                dataSource: this.dataSource
            };
        }

        // Filter to valid roulette numbers
        const validNumbers = hitZoneNumbers.filter(n => n >= 0 && n <= 36);
        if (validNumbers.length === 0) {
            return {
                hasContext: false,
                aggregateSeverity: 0,
                maxSeverity: 0,
                avgLossStreak: 0,
                numbersAnalyzed: 0,
                elevatedNumbers: [],
                contextDescription: 'No valid numbers in hit zone',
                hasApiData: false,
                dataSource: this.dataSource
            };
        }

        // Get severity for each number in the hit zone
        const severities = validNumbers.map(num => this.getNumberSeverity(num));

        // Calculate aggregate metrics
        let totalRatio = 0;
        let maxRatio = 0;
        let totalLossStreak = 0;
        let hasAnyApiData = false;
        const elevatedNumbers = [];

        for (const sev of severities) {
            totalRatio += sev.ratio;
            totalLossStreak += sev.currentLoss;
            
            if (sev.ratio > maxRatio) {
                maxRatio = sev.ratio;
            }
            
            if (sev.isApiMax) {
                hasAnyApiData = true;
            }
            
            // Track numbers with elevated streaks
            if (sev.ratio >= NUMBER_SEVERITY_THRESHOLDS.ELEVATED) {
                elevatedNumbers.push({
                    number: sev.number,
                    currentLoss: sev.currentLoss,
                    ratio: sev.ratio,
                    level: sev.level
                });
            }
        }

        const aggregateSeverity = totalRatio / severities.length;
        const avgLossStreak = totalLossStreak / severities.length;

        // Generate context description
        let contextDescription;
        if (aggregateSeverity < NUMBER_SEVERITY_THRESHOLDS.NORMAL) {
            contextDescription = 'Numbers within typical historical range';
        } else if (aggregateSeverity < NUMBER_SEVERITY_THRESHOLDS.MILD) {
            contextDescription = 'Minor number extensions observed';
        } else if (aggregateSeverity < NUMBER_SEVERITY_THRESHOLDS.ELEVATED) {
            contextDescription = 'Moderate number streaks detected';
        } else if (aggregateSeverity < NUMBER_SEVERITY_THRESHOLDS.HIGH) {
            contextDescription = 'Elevated number streak levels';
        } else if (aggregateSeverity < NUMBER_SEVERITY_THRESHOLDS.VERY_HIGH) {
            contextDescription = 'High number streak environment';
        } else {
            contextDescription = 'Unusual number environment (near historical extremes)';
        }

        // Add info about elevated numbers if any
        if (elevatedNumbers.length > 0) {
            const topElevated = elevatedNumbers
                .sort((a, b) => b.ratio - a.ratio)
                .slice(0, 3)
                .map(e => e.number)
                .join(', ');
            contextDescription += ` - Numbers ${topElevated} notably extended`;
        }

        return {
            hasContext: true,
            aggregateSeverity,
            maxSeverity: maxRatio,
            avgLossStreak,
            numbersAnalyzed: validNumbers.length,
            elevatedNumbers,
            contextDescription,
            hasApiData: hasAnyApiData,
            dataSource: this.dataSource,
            lastUpdated: this.lastUpdated,
            numberDetails: severities // Full details for each number
        };
    }

    /**
     * IMPROVED: Calculate aggregate severity bonus for a hit zone
     * Used by the scoring system to add contextual weight
     * @param {Array<number>} hitZoneNumbers - Numbers in the hit zone
     * @param {number} threshold - Minimum severity ratio to trigger bonus
     * @returns {number} Aggregate severity bonus for the hit zone
     */
    calculateHitZoneSeverityBonus(hitZoneNumbers, threshold = 0.5) {
        if (!hitZoneNumbers || hitZoneNumbers.length === 0) {
            return 0;
        }

        const validNumbers = hitZoneNumbers.filter(n => n >= 0 && n <= 36);
        if (validNumbers.length === 0) {
            return 0;
        }

        let totalBonus = 0;
        let validCount = 0;

        for (const num of validNumbers) {
            const bonus = this.getSeverityBonus(num, threshold);
            if (bonus > 0) {
                totalBonus += bonus;
                validCount++;
            }
        }

        // Return weighted average, not sum
        // This prevents larger hit zones from getting unfair advantage
        return validCount > 0 ? totalBonus / validNumbers.length : 0;
    }

    /**
     * Get confidence modifier based on number context
     * Returns a multiplier for group confidence adjustment
     * 
     * IMPROVED: Now returns values that can both reduce and increase confidence
     * - Low severity = neutral (1.0)
     * - Moderate severity = slight boost (1.0-1.2)
     * - High severity = larger boost (1.2-1.5)
     * 
     * NOTE: This is contextual interest, not prediction certainty
     * 
     * @param {Object} groupContext - Context from calculateGroupContext
     * @returns {number} Confidence modifier (0.8 to 1.5)
     */
    getConfidenceModifier(groupContext) {
        if (!groupContext || !groupContext.hasContext) {
            return 1.0; // No modification if no context
        }

        const severity = groupContext.aggregateSeverity;

        // IMPROVED: Graduated scale based on severity
        if (severity < NUMBER_SEVERITY_THRESHOLDS.NORMAL) {
            return 1.0; // Normal - no modification
        } else if (severity < NUMBER_SEVERITY_THRESHOLDS.MILD) {
            return 1.0; // Mild - still neutral
        } else if (severity < NUMBER_SEVERITY_THRESHOLDS.ELEVATED) {
            return 1.1; // Elevated - slight interest
        } else if (severity < NUMBER_SEVERITY_THRESHOLDS.HIGH) {
            return 1.2; // High - moderate interest
        } else if (severity < NUMBER_SEVERITY_THRESHOLDS.VERY_HIGH) {
            return 1.35; // Very high - notable interest
        } else {
            return 1.5; // Extreme - maximum interest
        }
    }

    /**
     * Get data source status for UI display
     * @returns {Object} Status object with label, description, and calibration state
     */
    getDataSourceStatus() {
        const totalCount = 37; // 0-36
        const apiCount = this.apiProvidedMaxNumbers.size;

        if (this.dataSource === 'api' && apiCount === totalCount) {
            return {
                status: 'full_api',
                label: 'Full API Data (5+ Years)',
                description: 'Historical max data for all 37 numbers from 5+ year API',
                isApiCalibrated: true,
                confidence: 'high',
                timestamp: this.apiDataTimestamp
            };
        }
        
        if (this.dataSource === 'api' && apiCount > 0) {
            return {
                status: 'partial_api',
                label: 'Partial API Data',
                description: `API data for ${apiCount}/${totalCount} numbers, defaults for rest`,
                isApiCalibrated: true,
                confidence: 'medium',
                timestamp: this.apiDataTimestamp
            };
        }
        
        if (this.dataSource === 'calculated') {
            return {
                status: 'session_only',
                label: 'Session Data Only',
                description: 'Using current session streaks with default historical bounds',
                isApiCalibrated: false,
                confidence: 'low'
            };
        }
        
        return {
            status: 'defaults',
            label: 'Using Defaults',
            description: 'Using conservative default values',
            isApiCalibrated: false,
            confidence: 'low'
        };
    }

    /**
     * Generate human-readable explanation for UI
     * @param {Object} groupContext - Context from calculateGroupContext
     * @returns {Object} Explanation for display
     */
    generateExplanation(groupContext) {
        if (!groupContext.hasContext) {
            return {
                headline: 'No historical number context',
                description: 'Number analysis unavailable for this configuration',
                details: [],
                disclaimer: null,
                isApiCalibrated: false
            };
        }

        const details = [];
        const dataStatus = this.getDataSourceStatus();

        // Add aggregate info
        details.push(
            `Analyzed ${groupContext.numbersAnalyzed} numbers in hit zone`
        );
        details.push(
            `Average non-appearance: ${groupContext.avgLossStreak.toFixed(1)} spins`
        );

        // Add elevated numbers info
        if (groupContext.elevatedNumbers.length > 0) {
            const elevatedList = groupContext.elevatedNumbers
                .slice(0, 3)
                .map(e => `${e.number} (${e.currentLoss} spins)`)
                .join(', ');
            details.push(`Extended numbers: ${elevatedList}`);
        }

        // Add aggregate context note
        if (groupContext.aggregateSeverity >= NUMBER_SEVERITY_THRESHOLDS.ELEVATED) {
            details.push(
                'Note: Extended streaks provide contextual interest'
            );
        }

        return {
            headline: groupContext.contextDescription,
            description: dataStatus.isApiCalibrated
                ? 'Calibrated with 5+ years of historical number data'
                : 'Using session data with default historical bounds',
            details,
            disclaimer: 'Historical patterns provide context only, not prediction. Each spin is independent.',
            confidenceModifier: this.getConfidenceModifier(groupContext),
            isApiCalibrated: dataStatus.isApiCalibrated,
            dataSourceLabel: dataStatus.label
        };
    }

    /**
     * Get summary of all number streaks for debugging/logging
     * @returns {Object} Summary object
     */
    getSummary() {
        const summary = {
            numbers: {},
            dataSource: this.dataSource,
            isInitialized: this.isInitialized,
            apiProvidedCount: this.apiProvidedMaxNumbers.size,
            lastUpdated: this.lastUpdated
        };

        for (let i = 0; i <= 36; i++) {
            const sev = this.getNumberSeverity(i);
            summary.numbers[i] = {
                currentLoss: sev.currentLoss,
                historicalMax: sev.historicalMax,
                ratio: sev.ratio,
                level: sev.level,
                isApiMax: sev.isApiMax
            };
        }

        return summary;
    }

    /**
     * Reset to default state
     */
    reset() {
        this._initializeDefaults();
        this.apiProvidedMaxNumbers.clear();
        this.lastUpdated = null;
        this.dataSource = 'defaults';
        this.isInitialized = false;
        this.apiDataTimestamp = null;
    }
}

// Export singleton instance
export const numberContext = new NumberContextManager();

// Export class for testing
export { NumberContextManager };