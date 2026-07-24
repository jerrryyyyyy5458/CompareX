import unittest

from services.comparison_engine import build_comparisons, extract_attributes, is_accessory
from services.normalizer import normalize_title


def product(title, price, store, slug, suffix):
    return {
        "id": suffix,
        "title": title,
        "current_price": price,
        "url": f"https://example.com/{suffix}",
        "store": store,
        "store_slug": slug,
        "availability": "In stock",
    }


class ComparisonEngineTests(unittest.TestCase):
    def test_preserves_plus_variant(self):
        self.assertEqual(normalize_title("realme 16 Pro+ 5G"), "realme 16 pro plus 5g")
        comparisons = build_comparisons([
            product("realme 16 Pro 5G", 100, "Amazon India", "amazon", "pro"),
            product("realme 16 Pro+ 5G", 110, "Flipkart", "flipkart", "pro-plus"),
        ], "realme 16")
        self.assertEqual(len(comparisons), 2)

    def test_audio_products_are_not_treated_as_accessories(self):
        self.assertFalse(is_accessory("Sony WH-1000XM5 Noise Cancelling Headphones", "sony wh-1000xm5"))
        attrs = extract_attributes("Sony WH-1000XM5 Noise Cancelling Headphones")
        self.assertEqual(attrs["brand"], "sony")
        self.assertEqual(attrs["model"], "wh 1000xm5")

    def test_groups_three_marketplaces_and_marks_lowest(self):
        products = [
            product("Insight Cosmetics Matte Lipstick - Red", 99, "Amazon India", "amazon", "amazon"),
            product("INSIGHT Cosmetics Matte Lipstick (Blue)", 84, "Flipkart", "flipkart", "flipkart"),
            product("Insight Cosmetics Matte Lipstick Black", 92, "AJIO", "ajio", "ajio"),
        ]

        comparisons = build_comparisons(products, "insight cosmetics matte lipstick")

        self.assertEqual(len(comparisons), 1)
        comparison = comparisons[0]
        self.assertEqual(comparison["offer_count"], 3)
        self.assertEqual(comparison["lowest_price"], 84)
        self.assertEqual(comparison["best_marketplace"], "Flipkart")
        self.assertEqual(
            {offer["store_slug"] for offer in comparison["offers"]},
            {"amazon", "flipkart", "ajio"},
        )


if __name__ == "__main__":
    unittest.main()
