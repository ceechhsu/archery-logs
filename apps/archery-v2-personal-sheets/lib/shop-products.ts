export interface ShopProduct {
  category: string;
  name: string;
  url: string;
  bestFor: string;
  why: string;
  caution?: string;
  priceTier: "Budget" | "Mid" | "Premium";
  imageUrl?: string;
}

export const shopProducts: ShopProduct[] = [
  {
    category: "Bow",
    name: "Samick Sage Archery Takedown Recurve Bow",
    url: "https://www.amazon.com/dp/B019JCDIQC/?tag=shih-chiehhsu-20&th=1",
    bestFor: "Beginners who do not need a full set",
    why: "This option has a 25 lb draw for right-handers, and you can choose the setup that best fits your needs.",
    priceTier: "Budget",
    imageUrl: "https://m.media-amazon.com/images/I/71Rs3bef7VL._AC_SL1500_.jpg"
  },
  {
    category: "Bow and Arrow Set",
    name: "Samick Sage Takedown Recurve Bow and Arrow Set - 62 Inch Complete Ready-to-Use Longbow Archery Set",
    url: "https://www.amazon.com/dp/B093N72HBS/?tag=shih-chiehhsu-20&th=1",
    bestFor: "Beginners who need a complete set",
    why: "This option has a 25 lb draw for right-handers, and you can choose the setup that best fits your needs.",
    priceTier: "Budget",
    imageUrl: "https://m.media-amazon.com/images/I/61qNEpWiPkL._AC_SL1431_.jpg"
  },
  {
    category: "Tools",
    name: "KESHES Archery Bow String Nocking Points Set - T Square Ruler, Nock Pliers with 6 Brass Nocks for Recurve Bow",
    url: "https://amzn.to/4kXRM9S",
    bestFor: "Beginners",
    why: "Helpful when resetting nocking points and doing basic setup tweaks.",
    priceTier: "Mid",
    imageUrl: "https://m.media-amazon.com/images/I/61PX8OTsrXL._AC_SL1500_.jpg"
  },
  {
    category: "Arrows",
    name: "30Inch Carbon Arrow Practice Hunting Arrows with Removable Tips for Compound & Recurve Bow(Pack of 12)",
    url: "https://www.amazon.com/dp/B08MX5NKRV/?tag=shih-chiehhsu-20&th=1",
    bestFor: "Beginners",
    why: "A practical add-on when you want extra arrows for longer practice sessions.",
    caution: "Make sure this fits your draw length.",
    priceTier: "Budget",
    imageUrl: "https://m.media-amazon.com/images/I/71ozlnbej0L._AC_SL1500_.jpg"
  }
];
