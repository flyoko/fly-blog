export type WeatherMotionState = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

const rainCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82])
const snowCodes = new Set([71, 73, 75, 77, 85, 86])
const stormCodes = new Set([95, 96, 99])

export function toWeatherMotionState(code: number): WeatherMotionState {
	if (stormCodes.has(code))
		return 'storm'
	if (snowCodes.has(code))
		return 'snow'
	if (rainCodes.has(code))
		return 'rain'
	if (code === 45 || code === 48)
		return 'fog'
	if (code >= 1 && code <= 3)
		return 'cloudy'
	return 'clear'
}
