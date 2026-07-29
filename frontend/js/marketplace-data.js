/* Shared marketplace identity data for animated homepage components. */
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

export const MARKETPLACES = [
  { name: "Amazon", color: "#ff9900", domain: "amazon.in", url: "https://www.amazon.in/" },
  { name: "Flipkart", color: "#2874f0", domain: "flipkart.com", url: "https://www.flipkart.com/" },
  { name: "Myntra", color: "#ff3f6c", domain: "myntra.com", url: "https://www.myntra.com/" },
  { name: "AJIO", color: "#b89b72", domain: "ajio.com", url: "https://www.ajio.com/" },
  { name: "Nykaa", color: "#fc2779", domain: "nykaa.com", url: "https://www.nykaa.com/" },
  { name: "Tata CLiQ", color: "#e40046", domain: "tatacliq.com", url: "https://www.tatacliq.com/" },
  { name: "Meesho", color: "#9f2089", domain: "meesho.com", url: "https://www.meesho.com/" },
  { name: "Lenskart", color: "#00a79d", domain: "lenskart.com", url: "https://www.lenskart.com/" },
  { name: "Adidas", color: "#000000", domain: "adidas.co.in", url: "https://www.adidas.co.in/" },
  { name: "Nike", color: "#111111", domain: "nike.com", url: "https://www.nike.com/in/" },
  { name: "Apollo Pharmacy", color: "#0072bc", domain: "apollopharmacy.in", url: "https://www.apollopharmacy.in/" },
  { name: "Vijay Sales", color: "#e22b2f", domain: "vijaysales.com", url: "https://www.vijaysales.com/" },
].map((marketplace) => ({
  ...marketplace,
  logo: marketplace.logo || favicon(marketplace.domain),
}));

export const SEARCH_MARKETPLACES = MARKETPLACES;
