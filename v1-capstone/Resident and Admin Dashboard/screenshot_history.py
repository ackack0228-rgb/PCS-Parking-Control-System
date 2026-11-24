from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/01_initial.png", full_page=True)
    print("현재 URL:", page.url)
    print("페이지 타이틀:", page.title())
    browser.close()
