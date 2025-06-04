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

    We use [pre-commit](https://pre-commit.com/) to enforce code style and catch errors early.

    After setting up the project, run:

    ```bash
    poetry run pre-commit install
    ```

    To run all hooks manually on all files:

    ```bash
    poetry run pre-commit run --all-files
    ```


---

## Types of Contributions

- Bug fixes
- Documentation improvements
- New features (please open an issue first)
- Tests or QA improvements
- Build/packaging enhancements

---

## Guidelines

### Code Style

- Use [Ruff](https://docs.astral.sh/ruff/) for linting:

    ```bash
    make lint
    ```

- Format code using:

    ```bash
    make format
    ```

- Follow existing file structure and conventions

### Branching

- Use descriptive branch names:
    - `fix/hotkey-delay`
    - `feature/groq-support`
    - `docs/update-readme`

### Commit Messages

- Keep messages clear and concise
- Examples:
    - `fix: handle hotkey registration error`
    - `docs: update setup instructions`

### Pull Requests

- Keep PRs small and focused
- Reference related issues in the description
- Include context or screenshots for UI changes
- Be respectful and collaborative in code reviews

---

## Reporting Issues

If you find a bug or usability issue:

1. Check existing [issues](https://github.com/demox-labs/ito/issues)
2. If it's not listed, open a new issue with:
    - Steps to reproduce
    - Expected vs. actual behavior
    - OS/environment details
    - Logs or screenshots, if applicable


---

## Questions?

Start a [Discussion](https://github.com/demox-labs/ito/discussions) or reach out at [hi@demoxlabs.xyz](mailto:hi@demoxlabs.xyz).