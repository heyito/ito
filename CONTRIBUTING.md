# Contributing to Ito

Thanks for your interest in contributing to Ito! Whether you're fixing bugs, suggesting features, improving documentation, or helping others, your contribution is welcome.

---

## Getting Started

1. **Fork the repository**

2. **Clone your fork:**

    ```bash
    git clone https://github.com/<your-username>/ito.git
    cd ito
    ```

3. **Set up the environment:**

    ```bash
    make setup
    source .venv/bin/activate
    make swift  # macOS only
    ```

4. **Run the tool:**

    ```bash
    python3 -m src.main
    ```

5. **Enable pre-commit hooks:**

    We use [pre-commit](https://pre-commit.com/) to enforce code style and catch issues before they land.

    ```bash
    poetry run pre-commit install
    ```

    To run all hooks manually:

    ```bash
    poetry run pre-commit run --all-files
    ```

---

## Development

### Formatting & Linting

- Run linter:
    ```bash
    make lint
    ```
- Auto-format code:
    ```bash
    make format
    ```
- VS Code users: install the [Ruff extension](https://marketplace.visualstudio.com/items?itemName=charliermarsh.ruff) for real-time linting.

### Adding Dependencies

Use Poetry to add dependencies:
```bash
poetry add <dependency-name>