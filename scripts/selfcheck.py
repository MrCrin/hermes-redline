#!/usr/bin/env python3
"""Minimal cross-surface extension and Windows-path regression check."""
import ast
import importlib.util
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def python_extensions(path: Path) -> tuple[str, ...]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "_CODE_EXT" for target in node.targets
        ):
            return tuple(ast.literal_eval(node.value))
    raise AssertionError(f"_CODE_EXT missing from {path}")


def main() -> None:
    js = """const fs=require('fs');const s=fs.readFileSync(process.argv[1],'utf8');const m=s.match(/const CODE_EXT = (\\[[\\s\\S]*?\\])/);if(!m)throw Error('CODE_EXT missing');console.log(JSON.stringify(Function('return '+m[1])()));"""
    frontend = tuple(json.loads(subprocess.check_output(["node", "-e", js, str(ROOT / "desktop/plugin.js")], text=True)))
    backend = python_extensions(ROOT / "dashboard/plugin_api.py")
    hooks = python_extensions(ROOT / "__init__.py")
    assert frontend == backend == hooks, (frontend, backend, hooks)

    spec = importlib.util.spec_from_file_location("redline_hooks", ROOT / "__init__.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module._skip_path(r"C:\\Users\\x\\.hermes\\cache\\y.py")
    assert not module._skip_path("/home/x/note.py")
    print("redline selfcheck: ok")


if __name__ == "__main__":
    main()
