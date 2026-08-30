#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 ]]; then
	exit 0
fi

changed_path="$1"

case "$changed_path" in
	e2e/mobile-visual.spec.ts|e2e/fixtures/mobile-quality.ts|e2e/fixtures/mobile-visual.css|e2e/mobile-visual.spec.ts-snapshots/*)
		printf '%s\n' "$changed_path"
		exit 0
		;;
	content/*|config/about/timeline.json|config/about/links.json|eslint.config.mjs|scripts/requires-mobile-quality.sh|scripts/is-admin-config-visual-advisory.sh|.github/*|docs/*|test/*|e2e/*|backups/*|workers/*)
		exit 1
		;;
	*)
		printf '%s\n' "$changed_path"
		exit 0
		;;
esac
