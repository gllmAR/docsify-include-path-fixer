# docsify-include-path-fixer
remote markdown relative path fixer

docsify-include-path-fixer.js
## Example

The following link uses docsify's include syntax pointing to a raw GitHub URL. It should be fixed by the plugin so relative includes inside the remote file resolve correctly.

[filename](https://raw.githubusercontent.com/gllmAR/gd-webexport-minimal/refs/heads/main/README.md ':include')

## Quick test

1. Start a simple static server in this folder (Python 3 example):

```bash
python3 -m http.server 8000
```

2. Open http://localhost:8000 in your browser. The Docsify page will load `README.md` and the include example above.

3. Verify that any relative links or images inside the included remote README resolve as expected.

Notes: If your browser blocks cross-origin requests to raw.githubusercontent.com, consider serving via a small local proxy or allowlist the origin for testing.