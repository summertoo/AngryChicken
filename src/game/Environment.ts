export enum Season {
  Spring = 'spring',
  Summer = 'summer',
  Autumn = 'autumn',
  Winter = 'winter',
}

export enum Weather {
  Sunny = 'sunny',
  Rainy = 'rainy',
  Snowy = 'snowy',
}

export enum TimeOfDay {
  Day = 'day',
  Twilight = 'twilight',
  Night = 'night',
}

export interface EnvironmentConfig {
  season: Season;
  weather: Weather;
  timeOfDay: TimeOfDay;
  seed: number;
}

const SEASONS: Season[] = [Season.Spring, Season.Summer, Season.Autumn, Season.Winter];
const WEATHERS: Weather[] = [Weather.Sunny, Weather.Rainy, Weather.Snowy];
const TIMES: TimeOfDay[] = [TimeOfDay.Day, TimeOfDay.Twilight, TimeOfDay.Night];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function generateEnvironment(levelId: number): EnvironmentConfig {
  const seed = levelId * 7919;
  const rng = seededRandom(seed);

  const season = SEASONS[Math.floor(rng() * SEASONS.length)];
  let weather: Weather;
  if (season === Season.Winter) {
    weather = rng() < 0.4 ? Weather.Snowy : rng() < 0.5 ? Weather.Rainy : Weather.Sunny;
  } else if (season === Season.Spring) {
    weather = rng() < 0.35 ? Weather.Rainy : Weather.Sunny;
  } else {
    weather = rng() < 0.2 ? Weather.Rainy : Weather.Sunny;
  }
  const timeOfDay = TIMES[Math.floor(rng() * TIMES.length)];

  return { season, weather, timeOfDay, seed };
}

export function getSkyColor(timeOfDay: TimeOfDay, season: Season): { top: string; bottom: string } {
  switch (timeOfDay) {
    case TimeOfDay.Day:
      switch (season) {
        case Season.Spring: return { top: '#4A90D9', bottom: '#87CEEB' };
        case Season.Summer: return { top: '#2E86DE', bottom: '#A8D8EA' };
        case Season.Autumn: return { top: '#5B7DB1', bottom: '#D4A574' };
        case Season.Winter: return { top: '#7BA7C9', bottom: '#D6EAF8' };
      }
    case TimeOfDay.Twilight:
      switch (season) {
        case Season.Spring: return { top: '#2C1810', bottom: '#E8A87C' };
        case Season.Summer: return { top: '#1A0F0A', bottom: '#F4A460' };
        case Season.Autumn: return { top: '#1A0F0A', bottom: '#C17817' };
        case Season.Winter: return { top: '#1E1E2E', bottom: '#B0C4DE' };
      }
    case TimeOfDay.Night:
      return { top: '#0A0A1A', bottom: '#1A1A3A' };
  }
}

export function getGroundColor(season: Season): string {
  switch (season) {
    case Season.Spring: return '#6B8E23';
    case Season.Summer: return '#558B2F';
    case Season.Autumn: return '#8B6914';
    case Season.Winter: return '#B0BEC5';
  }
}

export function getGroundLineColor(season: Season): string {
  switch (season) {
    case Season.Spring: return '#556B2F';
    case Season.Summer: return '#33691E';
    case Season.Autumn: return '#6D4C2A';
    case Season.Winter: return '#90A4AE';
  }
}

export function getStarCount(timeOfDay: TimeOfDay): number {
  switch (timeOfDay) {
    case TimeOfDay.Night: return 80;
    case TimeOfDay.Twilight: return 30;
    case TimeOfDay.Day: return 0;
  }
}
