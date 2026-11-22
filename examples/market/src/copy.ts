// The words of the market stall register. The shared catalog supplies every other word. No dash between words.
export const MARKET_COPY: Readonly<Record<string, string>> = {
  libraryPrompt: "Offer a stall or start your register.",
  libraryWho: "For the person who runs a market. Records stay on this device.",
  // The stall panel on the plot screen.
  stallHeading: "Stall",
  frontageNow: "Frontage: {frontage} cm.",
  frontageNone: "No frontage is set for this stall.",
  frontageLabel: "Frontage in cm",
  saveFrontage: "Save frontage",
  frontageSaved: "Frontage of {code} saved: {frontage} cm.",
  reserveHeading: "Reserve this stall",
  traderLabel: "Trader",
  neededLabel: "Width the trader needs in cm",
  startLabel: "Start date",
  reserveStall: "Reserve stall",
  stallReserved: "{code} reserved for {trader}.",
  reservedFor: "Reserved for {trader} from {date}. Needs {needed} cm.",
  noReservation: "No reservation.",
  // Refusals.
  stall_too_narrow: "A {needed} cm stand does not fit a {frontage} cm stall.",
  frontage_unknown: "Set the frontage of {code} first.",
  enterTrader: "Enter the trader.",
  enterWidth: "Enter a whole number of cm from 1 to 10000.",
  enterDate: "Use a valid date.",
};
