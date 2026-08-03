import { z } from 'zod'

export const weatherCitySchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(160),
	country: z.string().max(120).nullable(),
	admin1: z.string().max(120).nullable(),
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
	timezone: z.string().min(1).max(120),
})

export const weatherSearchResponseSchema = z.object({
	items: z.array(weatherCitySchema).max(10),
})

const weatherAvailableSchema = z.object({
	available: z.literal(true),
	city: z.string().min(1),
	timezone: z.string().min(1),
	temperature: z.number(),
	weatherCode: z.number().int(),
	condition: z.string().min(1),
	icon: z.string().min(1),
	isDay: z.boolean(),
	high: z.number(),
	low: z.number(),
	windSpeed: z.number().nonnegative().nullable(),
	precipitationProbability: z.number().min(0).max(100).nullable(),
	tip: z.string().min(1),
	observedAt: z.string().min(1),
	fetchedAt: z.iso.datetime(),
	stale: z.boolean(),
	sourceName: z.literal('Open-Meteo'),
	sourceUrl: z.url(),
})

const weatherUnavailableSchema = z.object({
	available: z.literal(false),
	reason: z.enum(['disabled', 'not_configured', 'temporarily_unavailable']),
	city: z.string().nullable(),
	fetchedAt: z.iso.datetime().nullable(),
	message: z.string().min(1),
	sourceName: z.literal('Open-Meteo'),
	sourceUrl: z.url(),
})

export const publicWeatherSchema = z.discriminatedUnion('available', [weatherAvailableSchema, weatherUnavailableSchema])

export type WeatherCity = z.infer<typeof weatherCitySchema>
export type PublicWeather = z.infer<typeof publicWeatherSchema>
