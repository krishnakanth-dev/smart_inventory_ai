/**
 * Mathematical and Statistical Forecasting Models in TypeScript
 * Implements Holt-Winters, SMA, Linear Regression, and AR(1) Auto-regressive fitting.
 */

/**
 * 1. Holt-Winters Triple Exponential Smoothing (Additive Seasonality)
 * Ideal for data with trend and seasonal variations (e.g. weekly sales spikes).
 * 
 * Update equations:
 * Level:     a_t = alpha * (y_t - s_{t-L}) + (1 - alpha) * (a_{t-1} + b_{t-1})
 * Trend:     b_t = beta * (a_t - a_{t-1}) + (1 - beta) * b_{t-1}
 * Seasonal:  s_t = gamma * (y_t - a_t) + (1 - gamma) * s_{t-L}
 * Forecast:  y_{t+m} = a_t + m * b_t + s_{t+m-L}
 */
export function holtWintersForecast(
  data: number[],
  seasonLength: number = 7,
  steps: number = 14,
  alpha: number = 0.2,
  beta: number = 0.1,
  gamma: number = 0.3
): number[] {
  const n = data.length;
  
  // Fallbacks for insufficient data
  if (n < seasonLength * 2) {
    // Fallback to Double Exponential Smoothing (level + trend) or linear regression
    return doubleExponentialSmoothing(data, steps, alpha, beta);
  }

  // Initialize seasonal factors (average of sales in the first season for baseline normalization)
  const seasons = Math.floor(n / seasonLength);
  const seasonAverages: number[] = [];
  for (let j = 0; j < seasons; j++) {
    let sum = 0;
    for (let i = 0; i < seasonLength; i++) {
      sum += data[j * seasonLength + i];
    }
    seasonAverages.push(sum / seasonLength);
  }

  // Initial Level a0
  let a_t = seasonAverages[0];

  // Initial Trend b0
  let trendSum = 0;
  for (let i = 0; i < seasonLength; i++) {
    trendSum += (data[seasonLength + i] - data[i]) / seasonLength;
  }
  let b_t = trendSum / seasonLength;

  // Initial Seasonal Indices s_i
  const s_t: number[] = new Array(seasonLength);
  for (let i = 0; i < seasonLength; i++) {
    let sumOfSeasonalOverAverages = 0;
    for (let j = 0; j < seasons; j++) {
      sumOfSeasonalOverAverages += data[j * seasonLength + i] - seasonAverages[j];
    }
    s_t[i] = sumOfSeasonalOverAverages / seasons;
  }

  // Smoothed levels, trends and seasonal indices over history
  const levels: number[] = [a_t];
  const trends: number[] = [b_t];
  const seasonalIndices: number[] = [...s_t];

  for (let t = seasonLength; t < n; t++) {
    const y_t = data[t];
    const prevLevel = levels[levels.length - 1];
    const prevTrend = trends[trends.length - 1];
    const seasonalIndexFromPrevSeason = seasonalIndices[t - seasonLength];

    // Update level
    const currentLevel = alpha * (y_t - seasonalIndexFromPrevSeason) + (1 - alpha) * (prevLevel + prevTrend);
    levels.push(currentLevel);

    // Update trend
    const currentTrend = beta * (currentLevel - prevLevel) + (1 - beta) * prevTrend;
    trends.push(currentTrend);

    // Update seasonal index
    const currentSeasonal = gamma * (y_t - currentLevel) + (1 - gamma) * seasonalIndexFromPrevSeason;
    seasonalIndices.push(currentSeasonal);
  }

  const finalLevel = levels[levels.length - 1];
  const finalTrend = trends[trends.length - 1];

  // Generate future predictions
  const predictions: number[] = [];
  for (let m = 1; m <= steps; m++) {
    const seasonalIdx = seasonalIndices[n - seasonLength + ((m - 1) % seasonLength)];
    const predictedValue = finalLevel + m * finalTrend + seasonalIdx;
    predictions.push(Math.max(0, Math.round(predictedValue)));
  }

  return predictions;
}

/**
 * 2. Double Exponential Smoothing (Holt's Linear Trend)
 * Used when trend is present but seasonality is absent or cannot be resolved due to limited data.
 */
export function doubleExponentialSmoothing(
  data: number[],
  steps: number = 14,
  alpha: number = 0.2,
  beta: number = 0.1
): number[] {
  const n = data.length;
  if (n < 3) {
    // Complete fallback to moving average or flat-line
    const avg = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 10;
    return new Array(steps).fill(Math.max(0, Math.round(avg)));
  }

  let level = data[0];
  let trend = data[1] - data[0];

  for (let i = 1; i < n; i++) {
    const prevLevel = level;
    level = alpha * data[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  const predictions: number[] = [];
  for (let m = 1; m <= steps; m++) {
    predictions.push(Math.max(0, Math.round(level + m * trend)));
  }
  return predictions;
}

/**
 * 3. Simple Moving Average (SMA)
 * Smooths fluctuations and returns the rolling mean.
 */
export function movingAverageForecast(
  data: number[],
  windowSize: number = 5,
  steps: number = 14
): number[] {
  const n = data.length;
  if (n === 0) return new Array(steps).fill(0);

  const effectiveWindow = Math.min(windowSize, n);
  const recentData = data.slice(n - effectiveWindow);
  const sum = recentData.reduce((a, b) => a + b, 0);
  const average = sum / effectiveWindow;

  // Simple moving average projects a flat-line forecast
  return new Array(steps).fill(Math.max(0, Math.round(average)));
}

/**
 * 4. Linear Regression Forecast (Least-Squares Trend)
 * Fits y = m * x + c and projects forward.
 */
export function linearRegressionForecast(
  data: number[],
  steps: number = 14
): number[] {
  const n = data.length;
  if (n < 2) {
    const base = n === 1 ? data[0] : 10;
    return new Array(steps).fill(Math.max(0, Math.round(base)));
  }

  // Calculate means
  let xSum = 0;
  let ySum = 0;
  for (let i = 0; i < n; i++) {
    xSum += i;
    ySum += data[i];
  }
  const xMean = xSum / n;
  const yMean = ySum / n;

  // Calculate slope m and intercept c
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (data[i] - yMean);
    denominator += (i - xMean) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  // Generate forecasts
  const predictions: number[] = [];
  for (let m = 0; m < steps; m++) {
    const futureIndex = n + m;
    const value = slope * futureIndex + intercept;
    predictions.push(Math.max(0, Math.round(value)));
  }

  return predictions;
}

/**
 * 5. AR(1) Auto-Regressive Forecast
 * Fits X_t = c + phi * X_{t-1} + error by running a linear regression of data[t] on data[t-1].
 */
export function ar1Forecast(
  data: number[],
  steps: number = 14
): number[] {
  const n = data.length;
  if (n < 4) {
    // Fall back to moving average
    return movingAverageForecast(data, 3, steps);
  }

  // Create pairs of lag-1: X_t (Y) on X_{t-1} (X)
  const Y = data.slice(1);
  const X = data.slice(0, n - 1);
  const m = Y.length;

  let xSum = 0;
  let ySum = 0;
  for (let i = 0; i < m; i++) {
    xSum += X[i];
    ySum += Y[i];
  }
  const xMean = xSum / m;
  const yMean = ySum / m;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < m; i++) {
    numerator += (X[i] - xMean) * (Y[i] - yMean);
    denominator += (X[i] - xMean) ** 2;
  }

  let phi = denominator === 0 ? 0 : numerator / denominator;
  
  // Constrain phi for stability (avoid exponential divergence)
  if (Math.abs(phi) >= 1.0) {
    phi = phi > 0 ? 0.9 : -0.9;
  }

  const c = yMean - phi * xMean;

  // Forecast iteratively
  const predictions: number[] = [];
  let lastVal = data[n - 1];

  for (let m = 0; m < steps; m++) {
    const nextVal = c + phi * lastVal;
    predictions.push(Math.max(0, Math.round(nextVal)));
    lastVal = nextVal;
  }

  return predictions;
}
