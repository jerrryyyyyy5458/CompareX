/* Shared marketplace identity data for animated homepage components. */
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

export const MARKETPLACES = [
  { name: "Amazon", color: "#ff9900", domain: "amazon.in", url: "https://www.amazon.in/" },
  { name: "Flipkart", color: "#2874f0", domain: "flipkart.com", url: "https://www.flipkart.com/" },
  { name: "Myntra", color: "#ff3f6c", domain: "myntra.com", url: "https://www.myntra.com/" },
  { name: "AJIO", color: "#b89b72", domain: "ajio.com", url: "https://www.ajio.com/" },
  { name: "Nykaa", color: "#fc2779", domain: "nykaa.com", url: "https://www.nykaa.com/" },
  { name: "Blinkit", color: "#f8cb46", domain: "blinkit.com", url: "https://blinkit.com/" },
  { name: "Zepto", color: "#8f2de2", domain: "zeptonow.com", url: "https://www.zeptonow.com/" },
  { name: "BigBasket", color: "#84c225", domain: "bigbasket.com", url: "https://www.bigbasket.com/", logo: "https://cdn.simpleicons.org/bigbasket/84c225" },
  { name: "Meesho", color: "#9f2089", domain: "meesho.com", url: "https://www.meesho.com/" },
  { name: "Reliance Digital", color: "#e42529", domain: "reliancedigital.in", url: "https://www.reliancedigital.in/" },
  { name: "Croma", color: "#24a148", domain: "croma.com", url: "https://www.croma.com/" },
  { name: "Tata CLiQ", color: "#e40046", domain: "tatacliq.com", url: "https://www.tatacliq.com/" },
  { name: "FirstCry", color: "#f58220", domain: "firstcry.com", url: "https://www.firstcry.com/" },
  { name: "JioMart", color: "#0078ad", domain: "jiomart.com", url: "https://www.jiomart.com/" },
  { name: "Lenskart", color: "#00a79d", domain: "lenskart.com", url: "https://www.lenskart.com/" },
  { name: "Netmeds", color: "#24aeb1", domain: "netmeds.com", url: "https://www.netmeds.com/" },
  { name: "PharmEasy", color: "#10847e", domain: "pharmeasy.in", url: "https://pharmeasy.in/" },
  { name: "ShopClues", color: "#24a3b5", domain: "shopclues.com", url: "https://www.shopclues.com/" },
  { name: "Pepperfry", color: "#ff7035", domain: "pepperfry.com", url: "https://www.pepperfry.com/" },
  { name: "Vijay Sales", color: "#e22b2f", domain: "vijaysales.com", url: "https://www.vijaysales.com/" },
  { name: "Instamart", color: "#fc8019", domain: "swiggy.com", url: "https://www.swiggy.com/instamart" },
].map((marketplace) => ({
  ...marketplace,
  logo: marketplace.logo || favicon(marketplace.domain),
}));

export const SEARCH_MARKETPLACES = MARKETPLACES.slice(0, 13);
