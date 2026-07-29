/* Curated product suggestion catalog for client-side autocomplete. */

function thumb(label, from = "#ff7a1a", to = "#ff6510") {
  const text = encodeURIComponent(String(label || "?").slice(0, 2).toUpperCase());
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='${encodeURIComponent(from)}'/%3E%3Cstop offset='1' stop-color='${encodeURIComponent(to)}'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='80' height='80' rx='18' fill='url(%23g)'/%3E%3Ctext x='40' y='46' text-anchor='middle' fill='white' font-family='Inter,Arial,sans-serif' font-size='22' font-weight='700'%3E${text}%3C/text%3E%3C/svg%3E`;
}

/** @type {Array<{id:string,name:string,brand:string,category:string,price?:number,image:string,keywords:string[]}>} */
export const SUGGESTION_CATALOG = [
  // Apple
  { id: "iphone-16", name: "iPhone 16", brand: "Apple", category: "Smartphones", price: 79900, image: thumb("16", "#1d1d1f", "#434344"), keywords: ["iph", "iphone", "apple", "16"] },
  { id: "iphone-16-plus", name: "iPhone 16 Plus", brand: "Apple", category: "Smartphones", price: 89900, image: thumb("16+", "#1d1d1f", "#434344"), keywords: ["iph", "iphone", "apple", "plus"] },
  { id: "iphone-16-pro", name: "iPhone 16 Pro", brand: "Apple", category: "Smartphones", price: 119900, image: thumb("16P", "#2c2c2e", "#636366"), keywords: ["iph", "iphone", "apple", "pro"] },
  { id: "iphone-16-pro-max", name: "iPhone 16 Pro Max", brand: "Apple", category: "Smartphones", price: 144900, image: thumb("PM", "#2c2c2e", "#636366"), keywords: ["iph", "iphone", "apple", "pro", "max"] },
  { id: "iphone-15", name: "iPhone 15", brand: "Apple", category: "Smartphones", price: 69900, image: thumb("15", "#1d1d1f", "#434344"), keywords: ["iph", "iphone", "apple", "15"] },
  { id: "iphone-15-pro", name: "iPhone 15 Pro", brand: "Apple", category: "Smartphones", price: 99900, image: thumb("15P", "#2c2c2e", "#636366"), keywords: ["iph", "iphone", "apple", "pro"] },
  { id: "airpods-pro", name: "AirPods Pro", brand: "Apple", category: "Audio", price: 24900, image: thumb("AP", "#f5f5f7", "#d2d2d7"), keywords: ["airpods", "airpod", "apple", "earbuds"] },
  { id: "airpods-4", name: "AirPods 4", brand: "Apple", category: "Audio", price: 12900, image: thumb("A4", "#f5f5f7", "#d2d2d7"), keywords: ["airpods", "airpod", "apple"] },
  { id: "apple-watch-10", name: "Apple Watch Series 10", brand: "Apple", category: "Wearables", price: 46900, image: thumb("AW", "#1d1d1f", "#ff7a1a"), keywords: ["apple", "watch", "series"] },
  { id: "macbook-air-m3", name: "MacBook Air M3", brand: "Apple", category: "Laptops", price: 114900, image: thumb("MBA", "#a8b0b8", "#6e767d"), keywords: ["macbook", "mac", "air", "apple", "laptop"] },
  { id: "ipad-air", name: "iPad Air", brand: "Apple", category: "Tablets", price: 59900, image: thumb("iA", "#5e5ce6", "#bf5af2"), keywords: ["ipad", "apple", "tablet"] },

  // MARS beauty
  { id: "mars-spf50-concealer", name: "MARS SPF50 Concealer", brand: "MARS", category: "Beauty", price: 299, image: thumb("MC", "#c2185b", "#ff7a1a"), keywords: ["mars", "spf", "concealer", "makeup"] },
  { id: "mars-foundation", name: "MARS Foundation", brand: "MARS", category: "Beauty", price: 349, image: thumb("MF", "#c2185b", "#ff7a1a"), keywords: ["mars", "foundation", "makeup"] },
  { id: "mars-lipstick", name: "MARS Lipstick", brand: "MARS", category: "Beauty", price: 249, image: thumb("ML", "#c2185b", "#e91e63"), keywords: ["mars", "lipstick", "lip", "makeup"] },
  { id: "mars-eyeshadow", name: "MARS Eyeshadow Palette", brand: "MARS", category: "Beauty", price: 499, image: thumb("ME", "#c2185b", "#9c27b0"), keywords: ["mars", "eyeshadow", "palette", "makeup"] },
  { id: "mars-mascara", name: "MARS Mascara", brand: "MARS", category: "Beauty", price: 199, image: thumb("MM", "#c2185b", "#212121"), keywords: ["mars", "mascara", "makeup"] },
  { id: "mars-blush", name: "MARS Blush", brand: "MARS", category: "Beauty", price: 279, image: thumb("MB", "#c2185b", "#ff8a80"), keywords: ["mars", "blush", "makeup"] },

  // Beauty / personal care
  { id: "lakme-foundation", name: "Lakmé Absolute Foundation", brand: "Lakmé", category: "Beauty", price: 650, image: thumb("LF", "#ed5f7f", "#c2185b"), keywords: ["lakme", "lakmé", "foundation"] },
  { id: "maybelline-fitme", name: "Maybelline Fit Me Foundation", brand: "Maybelline", category: "Beauty", price: 449, image: thumb("FM", "#000000", "#ffc107"), keywords: ["maybelline", "fit me", "foundation"] },
  { id: "nykaa-lipstick", name: "Nykaa Soft Matte Lipstick", brand: "Nykaa", category: "Beauty", price: 399, image: thumb("NL", "#ed5f7f", "#9c27b0"), keywords: ["nykaa", "lipstick"] },
  { id: "blue-heaven-nail", name: "Blue Heaven Nail Paint", brand: "Blue Heaven", category: "Beauty", price: 99, image: thumb("BH", "#1565c0", "#42a5f5"), keywords: ["blue", "heaven", "nail", "paint"] },

  // Electronics / phones
  { id: "samsung-s24", name: "Samsung Galaxy S24", brand: "Samsung", category: "Smartphones", price: 74999, image: thumb("S24", "#1428a0", "#000000"), keywords: ["samsung", "galaxy", "s24", "phone"] },
  { id: "samsung-s24-ultra", name: "Samsung Galaxy S24 Ultra", brand: "Samsung", category: "Smartphones", price: 129999, image: thumb("SU", "#1428a0", "#000000"), keywords: ["samsung", "galaxy", "ultra", "s24"] },
  { id: "oneplus-12", name: "OnePlus 12", brand: "OnePlus", category: "Smartphones", price: 64999, image: thumb("OP", "#eb0029", "#111111"), keywords: ["oneplus", "one plus", "12", "phone"] },
  { id: "pixel-8", name: "Google Pixel 8", brand: "Google", category: "Smartphones", price: 75999, image: thumb("P8", "#4285f4", "#34a853"), keywords: ["pixel", "google", "phone"] },
  { id: "nothing-phone-2", name: "Nothing Phone (2)", brand: "Nothing", category: "Smartphones", price: 44999, image: thumb("N2", "#111111", "#ffffff"), keywords: ["nothing", "phone"] },
  { id: "redmi-note-13", name: "Redmi Note 13 Pro", brand: "Xiaomi", category: "Smartphones", price: 23999, image: thumb("RN", "#ff6900", "#111111"), keywords: ["redmi", "note", "xiaomi", "phone"] },

  // Audio / wearables
  { id: "boat-airdopes", name: "boAt Airdopes 141", brand: "boAt", category: "Audio", price: 1299, image: thumb("bA", "#e21b22", "#111111"), keywords: ["boat", "airdopes", "earbuds", "earphones"] },
  { id: "sony-wh1000", name: "Sony WH-1000XM5", brand: "Sony", category: "Audio", price: 29990, image: thumb("XM", "#000000", "#555555"), keywords: ["sony", "headphones", "wh1000", "xm5"] },
  { id: "jbl-flip", name: "JBL Flip 6", brand: "JBL", category: "Audio", price: 9999, image: thumb("JB", "#ff6600", "#111111"), keywords: ["jbl", "speaker", "flip", "bluetooth"] },
  { id: "noise-colorfit", name: "Noise ColorFit Pro 5", brand: "Noise", category: "Wearables", price: 3499, image: thumb("NC", "#00bfa5", "#111111"), keywords: ["noise", "smartwatch", "watch", "colorfit"] },

  // Fashion / footwear
  { id: "nike-air-force", name: "Nike Air Force 1", brand: "Nike", category: "Footwear", price: 7495, image: thumb("AF", "#111111", "#ffffff"), keywords: ["nike", "air", "force", "shoes", "sneakers"] },
  { id: "nike-dunk", name: "Nike Dunk Low", brand: "Nike", category: "Footwear", price: 8295, image: thumb("ND", "#111111", "#ff7a1a"), keywords: ["nike", "dunk", "shoes", "sneakers"] },
  { id: "adidas-ultraboost", name: "Adidas Ultraboost", brand: "Adidas", category: "Footwear", price: 15999, image: thumb("UB", "#000000", "#ffffff"), keywords: ["adidas", "ultraboost", "running", "shoes"] },
  { id: "puma-sneakers", name: "Puma Smash V2", brand: "Puma", category: "Footwear", price: 2999, image: thumb("PS", "#000000", "#ee3224"), keywords: ["puma", "sneakers", "shoes"] },
  { id: "running-shoes", name: "Running Shoes", brand: "Popular", category: "Footwear", price: 2499, image: thumb("RS", "#ff7a1a", "#ff6510"), keywords: ["running", "shoes", "sneakers"] },

  // Grocery / essentials
  { id: "amul-milk", name: "Amul Taaza Milk 1L", brand: "Amul", category: "Grocery", price: 68, image: thumb("AM", "#e30613", "#ffffff"), keywords: ["amul", "milk", "dairy", "taaza"] },
  { id: "nandini-milk", name: "Nandini Toned Milk", brand: "Nandini", category: "Grocery", price: 56, image: thumb("NM", "#1565c0", "#42a5f5"), keywords: ["nandini", "milk", "dairy"] },
  { id: "maggi", name: "Maggi 2-Minute Noodles", brand: "Maggi", category: "Grocery", price: 14, image: thumb("MG", "#ffcc00", "#e30613"), keywords: ["maggi", "noodles", "nestle"] },
  { id: "tata-salt", name: "Tata Salt 1kg", brand: "Tata", category: "Grocery", price: 28, image: thumb("TS", "#0033a0", "#ffffff"), keywords: ["tata", "salt"] },

  // Laptops / computing
  { id: "dell-inspiron", name: "Dell Inspiron 15", brand: "Dell", category: "Laptops", price: 54990, image: thumb("DI", "#007db8", "#111111"), keywords: ["dell", "inspiron", "laptop"] },
  { id: "hp-pavilion", name: "HP Pavilion 14", brand: "HP", category: "Laptops", price: 58990, image: thumb("HP", "#0096d6", "#111111"), keywords: ["hp", "pavilion", "laptop"] },
  { id: "lenovo-ideapad", name: "Lenovo IdeaPad Slim 3", brand: "Lenovo", category: "Laptops", price: 42990, image: thumb("LI", "#e2231a", "#111111"), keywords: ["lenovo", "ideapad", "laptop"] },

  // Gaming
  { id: "ps5", name: "PlayStation 5", brand: "Sony", category: "Gaming", price: 44990, image: thumb("PS5", "#003791", "#ffffff"), keywords: ["ps5", "playstation", "sony", "console", "gaming"] },
  { id: "xbox-series-s", name: "Xbox Series S", brand: "Microsoft", category: "Gaming", price: 34990, image: thumb("XS", "#107c10", "#111111"), keywords: ["xbox", "series", "microsoft", "gaming"] },
  { id: "nintendo-switch", name: "Nintendo Switch OLED", brand: "Nintendo", category: "Gaming", price: 31999, image: thumb("NS", "#e60012", "#111111"), keywords: ["nintendo", "switch", "oled", "gaming"] },

  // Home / appliances
  { id: "dyson-v15", name: "Dyson V15 Detect", brand: "Dyson", category: "Appliances", price: 62900, image: thumb("DV", "#6e2c00", "#c0c0c0"), keywords: ["dyson", "vacuum", "v15"] },
  { id: "philips-airfryer", name: "Philips Airfryer", brand: "Philips", category: "Appliances", price: 8999, image: thumb("PA", "#0b5ea8", "#111111"), keywords: ["philips", "airfryer", "air fryer"] },
  { id: "boat-smartwatch", name: "boAt Wave Call", brand: "boAt", category: "Wearables", price: 1499, image: thumb("bW", "#e21b22", "#111111"), keywords: ["boat", "watch", "smartwatch", "wave"] },
];
