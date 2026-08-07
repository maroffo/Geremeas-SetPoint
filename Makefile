# ABOUTME: Target di verifica del progetto: typecheck, vulnerabilità, unit test, e2e
# ABOUTME: `make check` è il gate pre-commit; `make test-e2e` avvia l'app vera e la interroga

TSC ?= npx tsc

.PHONY: check typecheck vuln test test-e2e

# Niente target lint: il progetto non ha un linter configurato (eslint rimosso
# da Next 16); il typecheck copre la parte statica.
check: typecheck vuln test

typecheck:
	$(TSC) --noEmit

vuln:
	npm audit --audit-level=moderate

test:
	npm test

test-e2e:
	bash scripts/e2e-smoke.sh
