/* Shared marketplace identity data for animated homepage components. */
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

export const MARKETPLACES = [
  { name: "Amazon", color: "#ff9900", domain: "amazon.in", url: "https://www.amazon.in/" },
  { name: "Flipkart", color: "#2874f0", domain: "flipkart.com", url: "https://www.flipkart.com/" },
  { name: "AJIO", color: "#b89b72", domain: "ajio.com", url: "https://www.ajio.com/" },
  { name: "Myntra", color: "#ff3f6c", domain: "myntra.com", url: "https://www.myntra.com/" },
  { name: "Meesho", color: "#9f2089", domain: "meesho.com", url: "https://www.meesho.com/" },
  { name: "Nykaa", color: "#fc2779", domain: "nykaa.com", url: "https://www.nykaa.com/" },
  { name: "Purplle", color: "#9c27b0", domain: "purplle.com", url: "https://www.purplle.com/" },
  { name: "Lenskart", color: "#00a79d", domain: "lenskart.com", url: "https://www.lenskart.com/" },
].map((marketplace) => ({
  ...marketplace,
  logo: marketplace.logo || favicon(marketplace.domain),
}));

export const SEARCH_MARKETPLACES = MARKETPLACES;
