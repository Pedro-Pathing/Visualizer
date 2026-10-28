# Tests

`pnpm test` runs every suite against each project in `fixtures/projects/`.

Most assertions are golden files in `golden/<fixture>/`: the normalized document, every code-export
variant, the timeline and sampled robot poses. They record what the app does today, not what it
should do. When a change is meant to alter output, run `pnpm test:update` and review the golden
diff as part of the change.

To cover a new file format or feature, add a `.pp` file to `fixtures/projects/` and run
`pnpm test:update` to generate its goldens.
