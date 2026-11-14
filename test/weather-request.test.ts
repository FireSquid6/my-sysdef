import { expect, test } from "bun:test"
import { DEFAULT_WEATHER_LOCATION, WEATHER_ENDPOINT, weatherLocation, weatherURL } from "../ags/weather-request"

test("weather requests always use the private endpoint and an explicit city", () => {
  expect(WEATHER_ENDPOINT).toBe("https://minibox-one.trex-city.ts.net:10443")
  expect(DEFAULT_WEATHER_LOCATION).toBe("Austin")
  expect(weatherURL()).toBe(`${WEATHER_ENDPOINT}/Austin?format=j1`)
  expect(weatherURL("Waco,Texas")).toBe(`${WEATHER_ENDPOINT}/Waco%2CTexas?format=j1`)
})
test("location is safely encoded as one path segment, never query or command input", () => {
  expect(weatherURL("  New York,NY\n")).toBe(`${WEATHER_ENDPOINT}/New%20York%2CNY?format=j1`)
  expect(weatherURL("São Paulo/BR?format=evil#fragment")).toBe(`${WEATHER_ENDPOINT}/S%C3%A3o%20Paulo%2FBR%3Fformat%3Devil%23fragment?format=j1`)
  expect(weatherURL("-I; echo test")).toBe(`${WEATHER_ENDPOINT}/-I%3B%20echo%20test?format=j1`)
})
test("missing or malformed locations fall back to Austin rather than proxy geolocation", () => {
  for (const location of [null, undefined, "", "  \n", "Austin\u0000TX", "Austin\nTexas", "x".repeat(161), "\ud800"]) {
    expect(weatherLocation(location)).toBe("Austin")
    expect(weatherURL(location)).toBe(`${WEATHER_ENDPOINT}/Austin?format=j1`)
  }
})
