.PHONY: all install clean lint format test build shell swift

# -------------------------------------------------------------------
# Install all dependencies (default)
all: install

# Needed for first time so that .venv is local to the project
setup:
	poetry config virtualenvs.in-project true
	poetry install

# Install all dependencies (including dev)
install:
	poetry install

# Clean up virtualenv and build artifacts
clean:
	rm -rf .venv dist build *.egg-info

# Run linters (does not fix)
lint:
	poetry run ruff check .

# Format code (auto-fix with Ruff + Black)
format:
	poetry run ruff check . --fix
	poetry run black .

# Run tests
test:
	poetry run pytest

# Drop into a poetry shell
shell:
	poetry shell

# Build swift helpers
swift: 
	swift build --package-path src/swift_helper -c release --arch arm64 --arch x86_64

clean:
	rm -rf context-*