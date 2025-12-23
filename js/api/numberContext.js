// js/api/numberContext.js - Number-Level Streak Context Manager
// Manages streak data for individual numbers (0-36) from API
// Uses 5+ year historical max data as normalization reference

/**
 * IMPORTANT: This module provides CONTEXT, not PREDICTION.
 * Historical max values normalize current observations.
 * High streaks indicate INCREASED UNCERTAINTY, not increased probability.
 */

// Default historical max values (conservative estimates if API data unavailable)
// These represent typical 5+ year maximums for individual numbers
const DEFAULT_HISTORICAL_MAX_PER_NUMBER = 150;

// Severity thresholds (as ratios of historical max)
export const SEVERITY_THRESHOLDS = {
    NORMAL: 0.3,
    MILD: 0.5,
    ELEVATED: 0.7,
    HIGH: 0.85,
    EXTREME: 1.0
};

/**
 * Number Context Manager
 * Tracks individual number loss streaks and provides normalized severity context
 */
class NumberContextManager {
    constructor() {
        this.currentLossStreaks = {};
        this.historicalMax = {};
        this.lastUpdated = null;
        this.dataSource = 'defaults';
        this.isInitialized = false;
        
        this.apiProvidedMaxNumbers = new Set();
        this.apiDataTimestamp = null;
        
        for (let i = 0; i <= 36; i++) {
            this.currentLossStreaks[i] = 0;
            this.historicalMax[i] = DEFAULT_HISTORICAL_MAX_PER_NUMBER;
        }
    }

    updateFromApi(apiLossesData) {
        if (!apiLossesData) {
            console.warn('[NumberContext] No API losses data provided');
            return false;
        }

        try {
            this.apiProvidedMaxNumbers.clear();

            if (typeof apiLossesData === 'object' && !Array.isArray(apiLossesData)) {
                for (const [numStr, data] of Object.entries(apiLossesData)) {
                    const num = parseInt(numStr, 10);
                    if (isNaN(num) || num < 0 || num > 36) continue;
                    
                    this.currentLossStreaks[num] = data.current || data.losses || 0;
                    
                    if (data.max !== undefined && data.max !== null && data.max > 0) {
                        this.historicalMax[num] = data.max;
                        this.apiProvidedMaxNumbers.add(num);
                    }
                }
                
                this.dataSource = this.apiProvidedMaxNumbers.size > 0 ? 'api' : 'calculated';
            } else {
                console.warn('[NumberContext] Unexpected API data format:', typeof apiLossesData);
                return false;
            }

            this.lastUpdated = new Date();
            this.apiDataTimestamp = new Date();
            this.isInitialized = true;
            
            console.log('[NumberContext] Updated from API:', {
                dataSource: this.dataSource,
                apiProvidedMaxCount: this.apiProvidedMaxNumbers.size,
                sampleNumbers: Array.from(this.apiProvidedMaxNumbers).slice(0, 5)
            });
            
            return true;
        } catch (error) {
            console.error('[NumberContext] Error processing API data:', error);
            return false;
        }
    }

    calculateFromSpinHistory(spinHistory) {
        if (!spinHistory || spinHistory.length === 0) {
            return;
        }

        for (let i = 0; i <= 36; i++) {
            this.currentLossStreaks[i] = 0;
        }

        const seenNumbers = new Set();
        
        for (const spin of spinHistory) {
            if (spin < 0 || spin > 36) continue;
            
            for (let num = 0; num <= 36; num++) {
                if (!seenNumbers.has(num)) {
                    this.currentLossStreaks[num]++;
                }
            }
            
            seenNumbers.add(spin);
        }

        if (this.dataSource !== 'api') {
            this.dataSource = 'calculated';
        }
        this.lastUpdated = new Date();
        this.isInitialized = true;
    }

    getNumberSeverity(num) {
        if (num < 0 || num > 36) {
            return null;
        }
        
        const currentLoss = this.currentLossStreaks[num] || 0;
        const maxLoss = this.historicalMax[num] || DEFAULT_HISTORICAL_MAX_PER_NUMBER;
        const isApiMax = this.apiProvidedMaxNumbers.has(num);

        const ratio = maxLoss > 0 ? currentLoss / maxLoss : 0;

        let level, description;
        if (ratio < SEVERITY_THRESHOLDS.NORMAL) {
            level = 'normal';
            description = 'within typical range';
        } else if (ratio < SEVERITY_THRESHOLDS.MILD) {
            level = 'mild';
            description = 'slightly extended';
        } else if (ratio < SEVERITY_THRESHOLDS.ELEVATED) {
            level = 'elevated';
            description = 'moderately extended';
        } else if (ratio < SEVERITY_THRESHOLDS.HIGH) {
            level = 'high';
            description = 'notably extended';
        } else {
            level = 'extreme';
            description = 'near historical extreme';
        }

        return {
            number: num,
            currentLoss,
            historicalMax: maxLoss,
            ratio: Math.min(ratio, 1.0),
            level,
            description,
            isApiMax
        };
    }

    calculateGroupNumberContext(hitZoneNumbers) {
        const validNumbers = hitZoneNumbers.filter(n => n >= 0 && n <= 36);
        if (validNumbers.length === 0) {
            return {
                hasContext: false,
                aggregateSeverity: 0,
                numberSeverities: [],
                highestSeverityNumber: null,
                contextDescription: 'No valid numbers in hit zone',
                hasApiData: false
            };
        }

        const numberSeverities = validNumbers.map(num => this.getNumberSeverity(num));
        
        const avgSeverity = numberSeverities.reduce((sum, s) => sum + s.ratio, 0) / numberSeverities.length;
        
        const highestSeverityNumber = numberSeverities.reduce((max, s) => 
            s.ratio > max.ratio ? s : max
        );
        
        const hasAnyApiData = numberSeverities.some(s => s.isApiMax);
        
        let contextDescription;
        if (avgSeverity < SEVERITY_THRESHOLDS.NORMAL) {
            contextDescription = 'Numbers within typical historical range';
        } else if (avgSeverity < SEVERITY_THRESHOLDS.MILD) {
            contextDescription = 'Minor extensions observed';
        } else if (avgSeverity < SEVERITY_THRESHOLDS.ELEVATED) {
            contextDescription = 'Moderate streak environment detected';
        } else if (avgSeverity < SEVERITY_THRESHOLDS.HIGH) {
            contextDescription = 'Elevated streak levels in hit zone';
        } else {
            contextDescription = 'Unusual environment (numbers near historical extremes)';
        }

        return {
            hasContext: true,
            aggregateSeverity: avgSeverity,
            numberSeverities,
            highestSeverityNumber,
            contextDescription,
            dataSource: this.dataSource,
            lastUpdated: this.lastUpdated,
            hasApiData: hasAnyApiData
        };
    }

    getConfidenceModifier(groupContext) {
        if (!groupContext.hasContext) {
            return 1.0;
        }

        const severity = groupContext.aggregateSeverity;

        if (severity < SEVERITY_THRESHOLDS.NORMAL) {
            return 1.0;
        } else if (severity < SEVERITY_THRESHOLDS.MILD) {
            return 0.98;
        } else if (severity < SEVERITY_THRESHOLDS.ELEVATED) {
            return 0.95;
        } else if (severity < SEVERITY_THRESHOLDS.HIGH) {
            return 0.90;
        } else {
            return 0.85;
        }
    }

    getSummary() {
        const summary = {
            isInitialized: this.isInitialized,
            dataSource: this.dataSource,
            lastUpdated: this.lastUpdated,
            apiDataTimestamp: this.apiDataTimestamp,
            apiProvidedMaxCount: this.apiProvidedMaxNumbers.size,
            totalNumbers: 37,
            hasFullApiData: this.apiProvidedMaxNumbers.size === 37,
            numbers: {}
        };

        for (let i = 0; i <= 36; i++) {
            summary.numbers[i] = this.getNumberSeverity(i);
        }

        return summary;
    }

    getDataSourceStatus() {
        const apiCount = this.apiProvidedMaxNumbers.size;
        const totalCount = 37;
        
        if (!this.isInitialized) {
            return {
                status: 'not_initialized',
                label: 'Not Connected',
                description: 'No number streak data loaded',
                isApiCalibrated: false,
                confidence: 'low'
            };
        }
        
        if (this.dataSource === 'api' && apiCount === totalCount) {
            return {
                status: 'full_api',
                label: '5+ Year Data Active',
                description: `Historical max data from API for all ${totalCount} numbers`,
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

    generateExplanation(groupContext) {
        if (!groupContext.hasContext) {
            return {
                headline: 'No historical number context',
                description: 'Streak analysis unavailable for this configuration.',
                details: [],
                disclaimer: null,
                isApiCalibrated: false
            };
        }

        const details = [];
        const dataStatus = this.getDataSourceStatus();

        if (groupContext.highestSeverityNumber) {
            const high = groupContext.highestSeverityNumber;
            const maxSource = high.isApiMax ? '(API)' : '(default)';
            details.push(
                `Highest streak: Number ${high.number} - ${high.currentLoss} spins since last hit ` +
                `(${high.description}, historical max: ${high.historicalMax} ${maxSource})`
            );
        }

        if (groupContext.aggregateSeverity >= SEVERITY_THRESHOLDS.ELEVATED) {
            details.push(
                `Note: Elevated streaks indicate increased variance and uncertainty`
            );
        }

        return {
            headline: groupContext.contextDescription,
            description: dataStatus.isApiCalibrated
                ? 'Calibrated with 5+ years of historical number streak data'
                : 'Using session data with default historical bounds',
            details,
            disclaimer: 'Historical patterns provide context only, not prediction. Each spin is independent.',
            confidenceModifier: this.getConfidenceModifier(groupContext),
            isApiCalibrated: dataStatus.isApiCalibrated,
            dataSourceLabel: dataStatus.label
        };
    }

    reset() {
        for (let i = 0; i <= 36; i++) {
            this.currentLossStreaks[i] = 0;
            this.historicalMax[i] = DEFAULT_HISTORICAL_MAX_PER_NUMBER;
        }
        this.lastUpdated = null;
        this.dataSource = 'defaults';
        this.isInitialized = false;
        this.apiProvidedMaxNumbers.clear();
        this.apiDataTimestamp = null;
    }
}

export const numberContext = new NumberContextManager();
export { NumberContextManager };