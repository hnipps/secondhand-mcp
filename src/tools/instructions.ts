export const INSTRUCTIONS = `Secondhand MCP searches live listings on Facebook Marketplace, eBay, Depop, Poshmark and Kijiji.

Locations: Facebook Marketplace and Kijiji searches are local. Pass a US city and state as "City, ST" ("Austin, TX", "Portland, OR") or a Canadian city and province as "City, PR" ("Toronto, ON", "Vancouver, BC", "Montréal, QC"). Do not pass a bare city name when a state or province would change the answer. Bare "Toronto" is Toronto, Ontario. Bare "London" is not resolved, because London, UK is larger than any indexed namesake. Before calling, translate whatever the user said into a city and region:
- "near me" or "around here". Use the location they gave you earlier in the conversation. Ask if you do not have one.
- a neighborhood, borough or landmark ("Capitol Hill", "the Annex"). Use its city and region.
- a ZIP or postal code. Use the city and region it belongs to.
- a metro area ("the Bay Area", "the GTA"). Pick its principal city ("San Francisco, CA", "Toronto, ON").
- somewhere outside the US and Canada. Pass the city and country as written. Facebook resolves those through its own search. Kijiji does not cover them and will say it searched Canada instead.

Empty results usually mean the search was too narrow, not that nothing exists. Before telling the user there is nothing available, try the obvious widening: drop qualifiers from the query down to the item itself, remove price bounds, or search the nearest larger city. Say which of these you tried.

Filters are not universal. Each parameter says which marketplaces apply it. Where one does not apply it is ignored, so do not describe results as filtered by something that marketplace never applied. Put those words in the query instead.

Always link every listing you mention, without the user asking. The link is how they open photos, check the seller, and buy. A listing shown without its link is a dead end. Use the listing title as the link text, and keep each link with its item rather than collecting links at the end.

Results are read-only. Nothing here can message a seller, make an offer, or buy anything, so do not tell the user an item has been purchased or reserved.`;