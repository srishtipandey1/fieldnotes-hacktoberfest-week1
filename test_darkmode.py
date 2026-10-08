import unittest

import

SAMPLE = "<html><head><title>x</title></head><body><p>hi</p></body></html>"


class DarkModeTests(unittest.TestCase):
    def test_inject_adds_styles_script_and_button(self):
        out = .inject(SAMPLE)
        self.assertIn('data-theme="dark"', out)
        self.assertIn("fieldnotesTheme", out)
        self.assertIn('id="themetoggle"', out)

    def test_head_and_body_order_preserved(self):
        out = .inject(SAMPLE)
        self.assertLess(out.index("darkmode-css"), out.index("</head>"))
        self.assertLess(out.index('id="themetoggle"'), out.index("</body>"))

    def test_inject_is_idempotent(self):
        once = .inject(SAMPLE)
        self.assertEqual(once, .inject(once))

    def test_app_page_includes_toggle(self):
        import app  # needs the one-line change in app.py
        self.assertIn('id="themetoggle"', app.PAGE)


if __name__ == "__main__":
    unittest.main()
