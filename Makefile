ICON_SVG = resources/icon.svg
ICON_SIZES = 16 32 64 128 256 512 1024
ICON_PNGS = $(addprefix resources/icon-,$(addsuffix .png,$(ICON_SIZES)))
# Disk images are named after build.productName in package.json.
PRODUCT_NAME = $(shell node -p "require('./package.json').build.productName")
DMG = $(wildcard dist/$(PRODUCT_NAME)-*-arm64.dmg)

.PHONY: icons build dist install install-mac clean dev

icons: $(ICON_PNGS)

resources/icon-%.png: $(ICON_SVG)
	sips -s format png -z $* $* "$<" --out "$@" 2>/dev/null

build:
	npm run build

dev:
	npm run dev

dist: icons
	npm run dist:mac

install: dist
	@DMG=$$(ls -t dist/$(PRODUCT_NAME)-*-arm64.dmg 2>/dev/null | head -1); \
	if [ -z "$$DMG" ]; then echo "No DMG found"; exit 1; fi; \
	echo "Opening $$DMG"; \
	open "$$DMG"

install-mac:
	npm run install:mac

clean:
	rm -rf dist out
	rm -f $(ICON_PNGS)
